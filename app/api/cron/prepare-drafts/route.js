// app/api/cron/prepare-drafts/route.js - the nightly job: prepares drafts for every owner who switched it on.
// Called by the host's scheduler (vercel.json "crons"), which sends "Authorization: Bearer <CRON_SECRET>".
// It only WRITES DRAFTS to the queue. It never sends an email, and it does not need anybody's Gmail access.
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { listAutopilotUsers, prepareDraftsForUser, loadAutopilot } from '../../../../lib/server/prepare-drafts.js';
import { getEntitlement } from '../../../../lib/server/tenant.js';
import { defaultCtx } from '../../../../lib/server/lead-finder-io.js';
import { listFinderUsers, runNightly, carryJobForward } from '../../../../lib/server/lead-finder-job.js';
import { listDealWatchUsers, runDealWatch } from '../../../../lib/server/deal-watch-job.js';
import { prepareRelationshipAsks } from '../../../../lib/server/relationship-asks.js';
import { featureAllowed } from '../../../../lib/tenant.js';
import { cronGate } from '../../../../lib/server/cron-auth.js';

export const maxDuration = 300;

export async function GET(request) {
  const denied = cronGate(request);
  if (denied) return denied;
  if (!isAdminMode()) return NextResponse.json({ error: 'Needs FIREBASE_SERVICE_ACCOUNT_JSON.' }, { status: 503, headers: NO_STORE });

  const db = getDb();
  const deadline = Date.now() + 270000;
  const summary = { owners: 0, first: 0, followup: 0, skipped: 0, ownersStopped: 0, finderOwners: 0, finderAdded: 0, watchOwners: 0, watchFound: 0, asks: 0 };

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
        // A search or list import still in progress carries on overnight, within the same daily website limit.
        const carried = await carryJobForward(db, uid, { ctx, until: Math.min(finderDeadline, Date.now() + 70000) });
        summary.finderAdded += carried.added || 0;
      } catch (e) {
        console.error('[cron find-leads] owner failed:', uid, e?.message);
      }
    }
  } catch (e) {
    console.error('[cron find-leads] skipped:', e?.message);
  }

  // Phase 1b: the listing feeds each owner watches. Reads the feeds and flags undervalued listings. It never buys or sends anything.
  const watchDeadline = Date.now() + 60000;
  try {
    const watchers = await listDealWatchUsers(db);
    for (const uid of watchers) {
      if (Date.now() > watchDeadline) break;
      try {
        if (!featureAllowed(await getEntitlement(db, uid), 'autopilot')) continue;
        const r = await runDealWatch(db, uid, { ctx: defaultCtx() });
        summary.watchOwners++; summary.watchFound += r.found || 0;
      } catch (e) {
        console.error('[cron deal-watch] owner failed:', uid, e?.message);
      }
    }
  } catch (e) {
    console.error('[cron deal-watch] skipped:', e?.message);
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
      const asks = await prepareRelationshipAsks(db, uid, { settings, deadline });
      summary.asks += asks.made;
      summary.first += r.first; summary.followup += r.followup; summary.skipped += r.skipped;
    } catch (e) {
      console.error('[cron prepare-drafts] owner failed:', uid, e?.message);
    }
  }
  return NextResponse.json({ success: true, ...summary }, { headers: NO_STORE });
}
