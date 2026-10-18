// app/api/cron/autosend/route.js - Autosend: sends the drafts the overnight job prepared, for every owner who switched it on.
// Scheduled once a day inside the default send window (see vercel.json); on a plan that allows more frequent crons it can run hourly:
// it is safe to call as often as you like because each owner's daily cap, send window and checks are enforced on every run.
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { listAutopilotUsers, loadAutopilot } from '../../../../lib/server/prepare-drafts.js';
import { autosendForUser } from '../../../../lib/server/autosend.js';
import { getEntitlement } from '../../../../lib/server/tenant.js';
import { featureAllowed } from '../../../../lib/tenant.js';
import { cronGate } from '../../../../lib/server/cron-auth.js';

export const maxDuration = 300;

export async function GET(request) {
  const denied = cronGate(request);
  if (denied) return denied;
  if (!isAdminMode()) return NextResponse.json({ error: 'Needs the server database connection (service account or server login).' }, { status: 503, headers: NO_STORE });

  const db = getDb();
  const deadline = Date.now() + 270000;
  const summary = { owners: 0, sent: 0, failed: 0, skipped: 0, stopped: {} };
  for (const uid of await listAutopilotUsers(db)) {
    if (Date.now() > deadline - 30000) { summary.stopped.time = (summary.stopped.time || 0) + 1; continue; }
    try {
      const settings = await loadAutopilot(db, uid);
      if (!settings.autoSend) continue;
      if (!featureAllowed(await getEntitlement(db, uid), 'autopilot')) continue; // unpaid / suspended / plan without it (SAAS_MODE only)
      summary.owners++;
      const r = await autosendForUser(db, uid, { settings, deadline });
      summary.sent += r.sent; summary.failed += r.failed; summary.skipped += r.skipped;
      if (r.stopped) summary.stopped[r.stopped] = (summary.stopped[r.stopped] || 0) + 1;
    } catch (e) {
      console.error('[cron autosend] owner failed:', uid, e?.message);
    }
  }
  return NextResponse.json({ success: true, ...summary }, { headers: NO_STORE });
}
