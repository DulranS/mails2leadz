// app/api/cron/pipeline/route.js - the pipeline check for every autopilot owner: alerts, pushes and the daily digest.
// Daily on Vercel Hobby (vercel.daily.json); hourly on Pro (vercel.hourly.json) so new alerts reach the owner within the hour.
import { NextResponse } from 'next/server';
import { isAdminMode, doc, getDoc } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { listAutopilotUsers, loadAutopilot } from '../../../../lib/server/prepare-drafts.js';
import { openMailbox } from '../../../../lib/server/autosend.js';
import { localParts } from '../../../../lib/autosend.js';
import { runPipelineForUser } from '../../../../lib/server/pipeline-run.js';
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
  const now = Date.now();
  const summary = { owners: 0, alerts: 0, pushed: 0, digests: 0, notes: {} };
  for (const uid of await listAutopilotUsers(db)) {
    if (Date.now() > deadline - 30000) { summary.notes.time = (summary.notes.time || 0) + 1; continue; }
    try {
      if (!featureAllowed(await getEntitlement(db, uid), 'autopilot')) continue;
      const cfg = await loadAutopilot(db, uid);
      const bs = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
      const { dateKey, hour } = localParts(now, cfg.tzOffsetMin);
      const fromName = cfg.senderName || bs?.profile?.businessName || '';
      let box;
      const mailbox = async () => { if (box === undefined) box = await openMailbox(db, uid); return box; };
      const out = await runPipelineForUser(db, uid, { cfg, bs, now, deadline, mailbox, fromName, dateKey, hour });
      summary.owners++;
      summary.alerts += out.pipelineAlerts || 0;
      if (out.push?.sent) summary.pushed += out.push.sent;
      if (out.pipelineDigest) summary.digests++;
      for (const n of out.notes) summary.notes[n] = (summary.notes[n] || 0) + 1;
    } catch (e) {
      console.error('[cron pipeline] owner failed:', uid, e?.message);
    }
  }
  return NextResponse.json({ success: true, ...summary }, { headers: NO_STORE });
}
