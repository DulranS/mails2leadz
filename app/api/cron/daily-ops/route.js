// app/api/cron/daily-ops/route.js - once a day, per owner who switched them on: subscription invoices + payment reminders,
// the Monday report email, and next week's content drafts. (Autosend of prospect emails is /api/cron/autosend.)
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { listAutopilotUsers, loadAutopilot } from '../../../../lib/server/prepare-drafts.js';
import { dailyOpsForUser } from '../../../../lib/server/daily-ops.js';
import { getEntitlement } from '../../../../lib/server/tenant.js';
import { featureAllowed } from '../../../../lib/tenant.js';
import { cronGate } from '../../../../lib/server/cron-auth.js';
import { runLifecycleEmails } from '../../../../lib/server/lifecycle.js';

export const maxDuration = 300;

export async function GET(request) {
  const denied = cronGate(request);
  if (denied) return denied;
  if (!isAdminMode()) return NextResponse.json({ error: 'Needs the server database connection (service account or server login).' }, { status: 503, headers: NO_STORE });

  const db = getDb();
  const deadline = Date.now() + 270000;
  const summary = { owners: 0, invoices: 0, invoiceEmails: 0, reminders: 0, reports: 0, posts: 0, notes: {} };
  for (const uid of await listAutopilotUsers(db)) {
    if (Date.now() > deadline - 30000) { summary.notes.time = (summary.notes.time || 0) + 1; continue; }
    try {
      const settings = await loadAutopilot(db, uid);
      if (!settings.autoBilling && !settings.autoContent && !settings.weeklyReport) continue;
      if (!featureAllowed(await getEntitlement(db, uid), 'autopilot')) continue; // unpaid / suspended / plan without it (SAAS_MODE only)
      summary.owners++;
      const r = await dailyOpsForUser(db, uid, { settings, deadline });
      summary.invoices += r.invoices; summary.invoiceEmails += r.invoiceEmails; summary.reminders += r.reminders; summary.posts += r.posts; if (r.report) summary.reports++;
      for (const n of r.notes) summary.notes[n] = (summary.notes[n] || 0) + 1;
    } catch (e) {
      console.error('[cron daily-ops] owner failed:', uid, e?.message);
    }
  }
  // Platform emails to the businesses that use this deployment (trial ending or ended, payment failed). SaaS mode with a mail
  // provider only; otherwise a no-op. Never lets a mail problem fail the owners' daily jobs above.
  try { summary.lifecycle = await runLifecycleEmails(db); } catch (e) { console.error('[cron daily-ops] lifecycle emails failed:', e?.message); summary.lifecycle = { error: true }; }
  return NextResponse.json({ success: true, ...summary }, { headers: NO_STORE });
}
