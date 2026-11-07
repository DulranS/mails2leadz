// app/api/cron/pipeline/route.js - the pipeline check for every autopilot owner: alerts, pushes and the daily digest.
// Daily on Vercel Hobby (vercel.daily.json); hourly on Pro (vercel.hourly.json) so new alerts reach the owner within the hour.
import { NextResponse } from 'next/server';
import { isAdminMode, doc, getDoc, setDoc } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { listAutopilotUsers, loadAutopilot } from '../../../../lib/server/prepare-drafts.js';
import { openMailbox } from '../../../../lib/server/autosend.js';
import { localParts } from '../../../../lib/autosend.js';
import { runPipelineForUser } from '../../../../lib/server/pipeline-run.js';
import { syncConfirmedToMeta } from '../../../../lib/server/meta-capi-sync.js';
import { loadList, suppressedEmails } from '../../../../lib/server/signup.js';
import { syncConfirmedToTiktok } from '../../../../lib/server/tiktok-sync.js';
import { enrichDealsForUser } from '../../../../lib/server/enrich-deals.js';
import { syncConfirmedToGoogle } from '../../../../lib/server/google-customer-match.js';
import { syncPurchasesToMeta } from '../../../../lib/server/meta-purchases.js';
import { syncPurchasesToTiktok } from '../../../../lib/server/tiktok-purchases.js';
import { syncPurchasesToGoogle } from '../../../../lib/server/google-purchases.js';
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
      const { dateKey, hour, dow } = localParts(now, cfg.tzOffsetMin);
      const fromName = cfg.senderName || bs?.profile?.businessName || '';
      let box;
      const mailbox = async () => { if (box === undefined) box = await openMailbox(db, uid); return box; };
      const out = await runPipelineForUser(db, uid, { cfg, bs, now, deadline, mailbox, fromName, dateKey, hour, dow });
      await setDoc(doc(db, 'users', uid, 'settings', 'autopilot'), { lastDayStarted: dateKey, lastDayStartedAt: new Date(now).toISOString() }, { merge: true }).catch(() => null);
      const hasAdSync = !!(process.env.META_DATASET_ID || process.env.TIKTOK_PIXEL_CODE || process.env.GOOGLE_ADS_CUSTOMER_ID);
      const prepared = hasAdSync ? { contacts: await loadList(db, uid), suppressed: await suppressedEmails(db, uid) } : null;
      const meta = await syncConfirmedToMeta(db, uid, { now, prepared });
      if (meta.sent) summary.metaSent = (summary.metaSent || 0) + meta.sent;
      const mp = await syncPurchasesToMeta(db, uid, { now });
      const tp = await syncPurchasesToTiktok(db, uid, { now });
      const gp = await syncPurchasesToGoogle(db, uid, { now });
      if (gp.sent) summary.googlePurchases = (summary.googlePurchases || 0) + gp.sent;
      if (tp.sent) summary.tiktokPurchases = (summary.tiktokPurchases || 0) + tp.sent;
      if (mp.sent) summary.metaPurchases = (summary.metaPurchases || 0) + mp.sent;
      const tt = await syncConfirmedToTiktok(db, uid, { now, prepared });
      if (tt.sent) summary.tiktokSent = (summary.tiktokSent || 0) + tt.sent;
      const gg = await syncConfirmedToGoogle(db, uid, { now, prepared });
      if (gg.sent) summary.googleSent = (summary.googleSent || 0) + gg.sent;
      const en = await enrichDealsForUser(db, uid, { now: new Date(now) });
      if (en.enriched) summary.enriched = (summary.enriched || 0) + en.enriched;
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
