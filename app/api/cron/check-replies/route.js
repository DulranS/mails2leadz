// app/api/cron/check-replies/route.js - the timed reply check: looks for replies for every owner who connected Gmail (read-only) and
// has not paused it, so replies are found, read in full, triaged and their follow-ups stopped even when nobody has the app open.
// Called by the host's scheduler (vercel.json "crons"), or by any free pinger, with "Authorization: Bearer <CRON_SECRET>".
// It never sends anything. A reply moves a deal FORWARD at most (never Won/Lost by itself); opt-out wording suppresses the address.
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { hasAccess } from '../../../../lib/access.js';
import { listEnabled, pickDue, gmailFor, recordRun } from '../../../../lib/server/gmail-connection.js';
import { tokenKeyUsable } from '../../../../lib/server/token-vault.js';
import { runReplyCheck, GmailAuthError } from '../../../../lib/server/reply-check.js';
import { REPLY_CHECK_BATCH } from '../../../../lib/reply-pick.js';
import { POST as trackCompany } from '../../track-company/route.js';

export const maxDuration = 300;

const MAX_BATCHES_PER_OWNER = 4; // up to 4 x 50 emails per owner per run, while time lasts

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Company tracking without a browser: the handler needs no sign-in of its own (the proxy gates the public route), so it is called directly.
const trackReply = (origin) => (payload) => trackCompany(new Request(`${origin}/api/track-company`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set on the server.' }, { status: 503, headers: NO_STORE });
  const m = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m || !safeEqual(m[1].trim(), secret)) return NextResponse.json({ error: 'Not allowed.' }, { status: 401, headers: NO_STORE });
  if (!isAdminMode()) return NextResponse.json({ error: 'Needs FIREBASE_SERVICE_ACCOUNT_JSON.' }, { status: 503, headers: NO_STORE });
  if (!tokenKeyUsable()) return NextResponse.json({ error: 'GMAIL_TOKEN_KEY is not set (or too short).' }, { status: 503, headers: NO_STORE });

  const db = getDb();
  const deadline = Date.now() + 270000;
  const origin = new URL(request.url).origin;
  const all = await listEnabled(db);
  const due = pickDue(all);
  const summary = { connected: all.length, due: due.length, owners: 0, checked: 0, replies: 0, autoReplies: 0, bounced: 0, needReconnect: 0, errors: 0, ownersStopped: 0 };

  for (const conn of due) {
    if (Date.now() > deadline) { summary.ownersStopped++; continue; }
    const uid = conn.uid;
    // Someone removed from the invite list (ALLOWED_EMAILS) no longer gets timed work done (and AI triage paid) for them.
    if (conn.appEmail && !hasAccess(conn.appEmail)) continue;
    const gmail = gmailFor(conn, uid);
    if (!gmail) { await recordRun(db, uid, conn, { error: 'The stored connection could not be read.', needsReconnect: true }).catch(() => {}); summary.needReconnect++; continue; }
    try {
      const total = { checked: 0, replyCount: 0, autoReplies: 0, bounced: [], errors: 0, waiting: 0 };
      const found = [];
      for (let i = 0; i < MAX_BATCHES_PER_OWNER && Date.now() < deadline; i++) {
        const r = await runReplyCheck({ db, gmail, userId: uid, senderEmail: conn.email, trackReply: trackReply(origin), deadline, max: REPLY_CHECK_BATCH });
        total.checked += r.checked; total.replyCount += r.replyCount; total.autoReplies += r.autoReplies; total.errors += r.errors; total.waiting = r.waiting;
        total.bounced.push(...r.bounced); found.push(...r.triage);
        if (r.waiting <= 0 || r.checked === 0) break;
      }
      await recordRun(db, uid, conn, { result: total, found });
      summary.owners++; summary.checked += total.checked; summary.replies += total.replyCount; summary.autoReplies += total.autoReplies; summary.bounced += total.bounced.length; summary.errors += total.errors;
    } catch (e) {
      if (e instanceof GmailAuthError) {
        // Revoked, or Google's 7-day limit for apps in "Testing" mode: stop trying until the owner reconnects (the Account page says so).
        await recordRun(db, uid, conn, { error: 'Google cancelled or expired this connection. Please connect again.', needsReconnect: true }).catch(() => {});
        summary.needReconnect++;
      } else {
        console.error('[cron check-replies] owner failed:', uid, e?.message);
        await recordRun(db, uid, conn, { error: 'The last check failed. It will try again.' }).catch(() => {});
        summary.errors++;
      }
    }
  }
  return NextResponse.json({ success: true, ...summary }, { headers: NO_STORE });
}
