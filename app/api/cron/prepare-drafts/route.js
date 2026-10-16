// app/api/cron/prepare-drafts/route.js - the nightly job: prepares drafts for every owner who switched it on.
// Called by the host's scheduler (vercel.json "crons"), which sends "Authorization: Bearer <CRON_SECRET>".
// It only WRITES DRAFTS to the queue. It never sends an email, and it does not need anybody's Gmail access.
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { listAutopilotUsers, prepareDraftsForUser, loadAutopilot } from '../../../../lib/server/prepare-drafts.js';
import { getEntitlement } from '../../../../lib/server/tenant.js';
import { defaultCtx } from '../../../../lib/server/lead-finder-io.js';
import { listFinderUsers, runNightly } from '../../../../lib/server/lead-finder-job.js';
import { featureAllowed } from '../../../../lib/tenant.js';

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
  const summary = { owners: 0, first: 0, followup: 0, skipped: 0, ownersStopped: 0, finderOwners: 0, finderAdded: 0 };

  // Phase 1: owners with a saved nightly search find new leads first (so phase 2 can write drafts for them the same night).
  // Time-boxed per owner and overall; it only fills the Lead Inbox. It never sends anything.
  const finderDeadline = Date.now() + 120000;
  try {
    const finders = await listFinderUsers(db);
    const ctx = defaultCtx();
    for (const uid of finders) {
      if (Date.now() > finderDeadline - 15000) break;
      try {
        if (!featureAllowed(await getEntitlement(db, uid), 'autopilot')) continue;
        const r = await runNightly(db, uid, { ctx, deadline: Math.min(finderDeadline, Date.now() + 60000) });
        summary.finderOwners++; summary.finderAdded += r.added || 0;
      } catch (e) {
        console.error('[cron find-leads] owner failed:', uid, e?.message);
      }
    }
  } catch (e) {
    console.error('[cron find-leads] skipped:', e?.message);
  }

  // Phase 2: drafts.
  const users = await listAutopilotUsers(db);
  summary.owners = users.length;
  for (const uid of users) {
    if (Date.now() > deadline) { summary.ownersStopped++; continue; }
    try {
      const settings = await loadAutopilot(db, uid);
      if (!settings.enabled) continue;
      if (!featureAllowed(await getEntitlement(db, uid), 'autopilot')) continue; // unpaid / suspended / plan without it (SAAS_MODE only)
      const r = await prepareDraftsForUser(db, uid, { settings, deadline });
      summary.first += r.first; summary.followup += r.followup; summary.skipped += r.skipped;
    } catch (e) {
      console.error('[cron prepare-drafts] owner failed:', uid, e?.message);
    }
  }
  return NextResponse.json({ success: true, ...summary }, { headers: NO_STORE });
}
