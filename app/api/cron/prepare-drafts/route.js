// app/api/cron/prepare-drafts/route.js - the nightly job: prepares drafts for every owner who switched it on.
// Called by the host's scheduler (vercel.json "crons"), which sends "Authorization: Bearer <CRON_SECRET>".
// It only WRITES DRAFTS to the queue. It never sends an email, and it does not need anybody's Gmail access.
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { listAutopilotUsers, prepareDraftsForUser, loadAutopilot } from '../../../../lib/server/prepare-drafts.js';

export const maxDuration = 300;

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set on the server.' }, { status: 503, headers: NO_STORE });
  const m = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m || !safeEqual(m[1].trim(), secret)) return NextResponse.json({ error: 'Not allowed.' }, { status: 401, headers: NO_STORE });
  if (!isAdminMode()) return NextResponse.json({ error: 'Needs FIREBASE_SERVICE_ACCOUNT_JSON.' }, { status: 503, headers: NO_STORE });

  const db = getDb();
  const deadline = Date.now() + 270000;
  const users = await listAutopilotUsers(db);
  const summary = { owners: users.length, first: 0, followup: 0, skipped: 0, ownersStopped: 0 };
  for (const uid of users) {
    if (Date.now() > deadline) { summary.ownersStopped++; continue; }
    try {
      const settings = await loadAutopilot(db, uid);
      if (!settings.enabled) continue;
      const r = await prepareDraftsForUser(db, uid, { settings, deadline });
      summary.first += r.first; summary.followup += r.followup; summary.skipped += r.skipped;
    } catch (e) {
      console.error('[cron prepare-drafts] owner failed:', uid, e?.message);
    }
  }
  return NextResponse.json({ success: true, ...summary }, { headers: NO_STORE });
}
