// lib/server/pipeline-run.js - the pipeline check for one owner, on every run of its job: stalled, lost and renewal alerts are
// recorded (never sent to a customer), a push goes to the owner's devices for new alerts, and the owner gets one digest a day.
// On the daily timetable it runs once a day; on the hourly timetable (Vercel Pro) new alerts reach the owner within the hour.
import { collection, doc, addDoc, setDoc, getDoc, getDocs, query, where, limit } from '../server-firestore.js';
import { buildRawEmail } from '../raw-email.js';
import { planStallAlerts, planLostRevivals, planRenewalAlerts, alertsDigest, stallThresholds, lastMonthWinLoss } from '../pipeline-alerts.js';
import { alertPushPayload } from '../push.js';
import { commissionLines, commissionText } from '../commissions.js';
import { sendOwnerPush } from './push.js';

const rows = async (db, coll, uid, n) => (await getDocs(query(collection(db, coll), where('userId', '==', uid), limit(n)))).docs.map((d) => ({ id: d.id, ...d.data() }));
const patchAutopilot = (db, uid, patch) => setDoc(doc(db, 'users', uid, 'settings', 'autopilot'), patch, { merge: true }).catch(() => {});

export async function runPipelineForUser(db, uid, { cfg = {}, bs = {}, now = Date.now(), deadline = Date.now() + 240000, mailbox, fromName = '', dateKey, hour, out = { notes: [] } } = {}) {
  try {
    const alertsCol = collection(db, 'users', uid, 'pipeline_alerts');
    const [deals, existing] = await Promise.all([rows(db, 'deals', uid, 2000), getDocs(query(alertsCol, limit(3000))).then((s) => s.docs.map((d) => d.data()))]);
    const stalled = planStallAlerts({ deals, tasks: existing, now, stallDays: stallThresholds(bs?.stallDays) });
    const revivals = planLostRevivals({ deals, tasks: existing, now });
    const renewals = planRenewalAlerts({ deals, tasks: existing, now });
    for (const a of [...stalled, ...revivals, ...renewals]) {
      if (Date.now() > deadline - 20000) { out.notes.push('time'); break; }
      await addDoc(alertsCol, { ...a.task, createdAt: new Date(now).toISOString() });
    }
    const created = stalled.length + revivals.length + renewals.length;
    out.pipelineAlerts = (out.pipelineAlerts || 0) + created;

    // Push for new alerts: immediate on the hourly timetable, the morning of the day on the daily one.
    if (created) out.push = await sendOwnerPush(db, uid, alertPushPayload({ stalled, revivals, renewals }));

    // The daily digest: once per local day, in the owner's daytime, under the morning-brief switch.
    const stored = (await getDoc(doc(db, 'users', uid, 'settings', 'autopilot')).catch(() => null))?.data?.() || {};
    const monthly = dateKey.endsWith('-01') ? lastMonthWinLoss(deals, now) : null;
    // Commission for last month, when the owner set a rate: on the first of the month only, with the monthly summary.
    let commission = [];
    if (monthly && Number(bs?.commissionPct) > 0) {
      const team = (await getDoc(doc(db, 'users', uid, 'settings', 'team')).catch(() => null))?.data?.() || {};
      const lines = commissionLines({ deals, members: team.members || [], pct: bs.commissionPct, year: monthly.year, month: monthly.month });
      commission = commissionText(lines, bs.commissionPct);
    }
    const digest = alertsDigest({ stalled, revivals, renewals, monthly, commission, senderName: fromName });
    if (digest && cfg.dailyBrief && hour >= 6 && hour < 22 && stored.lastPipelineDigestDate !== dateKey) {
      const b = await mailbox();
      if (!b.ok) out.notes.push(`pipeline_digest_${b.reason}`);
      else {
        await b.sendRaw(buildRawEmail({ from: b.email, fromName: 'AutoLeads', to: b.email, subject: digest.subject, body: digest.text }));
        out.pipelineDigest = true;
        await patchAutopilot(db, uid, { lastPipelineDigestDate: dateKey });
      }
    }
    await patchAutopilot(db, uid, { lastPipelineRunAt: new Date(now).toISOString() });
  } catch (e) {
    console.error('[pipeline] failed:', uid, String(e?.message || '').slice(0, 120));
    out.notes.push('pipeline_error');
  }
  return out;
}
