// app/api/cron/check-replies/route.js - the unattended reply check: for every owner who connected read-only Gmail, find new replies,
// record opt-outs, move deals forward on positive replies (the same logic as pressing "Check replies"), and leave a short
// "while you were away" notice. Called by the host's scheduler with "Authorization: Bearer <CRON_SECRET>". It cannot send anything.
// Pass 366: the check is answered at once (202) and the work runs in after(), so a scheduler with a 30-second timeout
// (for example cron-job.org) does not log a timeout while the check is still running.
import { NextResponse, after } from 'next/server';
import { collection, getDocs, query, where, setDoc, doc, isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { offlineConfigured, accessTokenFor, patchConnection } from '../../../../lib/server/gmail-offline.js';
import { loadAutopilot } from '../../../../lib/server/prepare-drafts.js';
import { buildNotice } from '../../../../lib/reply-notices.js';
import { getEntitlement } from '../../../../lib/server/tenant.js';
import { featureAllowed } from '../../../../lib/tenant.js';
// The reply-check logic lives in one place: the signed-in button and this job both run it.
import { POST as checkRepliesPOST } from '../../check-replies/route.js';

export const maxDuration = 300;
const MAX_ROUNDS = 3; // each round checks one batch (see REPLY_CHECK_BATCH); more than that waits for the next run

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function notice(db, uid, data) {
  const now = new Date();
  await setDoc(doc(db, 'reply_notices', `${uid}_${now.getTime()}`), { userId: uid, createdAt: now.toISOString(), seen: false, type: 'replies', ...data });
}

// The whole check, for every connected owner. Runs after the response has been sent; its result goes to the server log.
async function runReplyCheck(db, secret) {
  const deadline = Date.now() + 270000;
  const conns = await getDocs(query(collection(db, 'gmail_offline'), where('status', '==', 'ok')));
  const summary = { owners: conns.docs.length, checked: 0, replies: 0, expired: 0, failed: 0 };

  for (const c of conns.docs) {
    const uid = c.data().userId || c.id;
    if (Date.now() > deadline) break;
    try {
      const settings = await loadAutopilot(db, uid);
      if (settings.autoReplyCheck === false) continue; // connected, but the owner switched the unattended check off
      if (!featureAllowed(await getEntitlement(db, uid), 'offlineGmail')) continue; // unpaid / suspended / plan without it (SAAS_MODE only)
      const t = await accessTokenFor(db, uid);
      if (t.expired) {
        await patchConnection(db, uid, { status: 'expired', lastError: t.error, lastCheckAt: new Date().toISOString() });
        await notice(db, uid, { type: 'gmail_expired', replies: 0, lines: [t.error], autoReplies: 0 });
        summary.expired++;
        continue;
      }
      if (!t.token) { summary.failed++; continue; }

      let replyCount = 0; let autoReplies = 0; let bounced = 0; const triage = [];
      for (let round = 0; round < MAX_ROUNDS && Date.now() < deadline; round++) {
        const req = new Request('http://internal/api/check-replies', { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-cron': secret }, body: JSON.stringify({ userId: uid, accessToken: t.token, senderEmail: t.email }) });
        const res = await checkRepliesPOST(req);
        const d = await res.json().catch(() => ({}));
        if (!res.ok) break;
        replyCount += d.replyCount || 0; autoReplies += d.autoReplies || 0; bounced += Array.isArray(d.bounced) ? d.bounced.length : Number(d.bounced) || 0;
        triage.push(...(d.triage || []));
        if (!(d.waiting > 0 && d.checked > 0)) break;
      }
      summary.checked++; summary.replies += replyCount;
      await patchConnection(db, uid, { lastCheckAt: new Date().toISOString(), lastError: null });
      const n = buildNotice({ replyCount, triage, autoReplies, bounced });
      if (n) await notice(db, uid, n);
    } catch (e) {
      summary.failed++;
      console.error('[cron check-replies] owner failed:', uid, e?.message);
    }
  }
  console.log('[cron check-replies] done', JSON.stringify(summary));
  return summary;
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set on the server.' }, { status: 503, headers: NO_STORE });
  const m = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m || !safeEqual(m[1].trim(), secret)) return NextResponse.json({ error: 'Not allowed.' }, { status: 401, headers: NO_STORE });
  if (!isAdminMode() || !offlineConfigured()) return NextResponse.json({ error: 'Needs FIREBASE_SERVICE_ACCOUNT_JSON, GOOGLE_CLIENT_SECRET and TOKEN_ENC_KEY.' }, { status: 503, headers: NO_STORE });

  const db = getDb();
  // Answer at once; the check itself runs after the response, within this function's maxDuration.
  after(() => runReplyCheck(db, secret).catch((e) => console.error('[cron check-replies] run failed:', e?.message)));
  return NextResponse.json({ accepted: true, startedAt: new Date().toISOString() }, { status: 202, headers: NO_STORE });
}
