// lib/server/pipeline-run.js - the pipeline check for one owner, on every run of its job: stalled, lost and renewal alerts are
// recorded (never sent to a customer), a push goes to the owner's devices for new alerts, and the owner gets one digest a day.
// On the daily timetable it runs once a day; on the hourly timetable (Vercel Pro) new alerts reach the owner within the hour.
import { collection, doc, addDoc, setDoc, getDoc, getDocs, query, where, limit } from '../server-firestore.js';
import { buildRawEmail } from '../raw-email.js';
import { planStallAlerts, planLostRevivals, planRenewalAlerts, alertsDigest, stallThresholds, lastMonthWinLoss } from '../pipeline-alerts.js';
import { alertPushPayload } from '../push.js';
import { commissionLines, commissionText } from '../commissions.js';
import { quotaLines, quotaText, pipelineVelocityDays } from '../sales-metrics.js';
import { buildActionList, actionText } from '../action-list.js';
import { attributeRevenue } from '../multi-touch.js';
import { sendOwnerPush } from './push.js';

const rows = async (db, coll, uid, n) => (await getDocs(query(collection(db, coll), where('userId', '==', uid), limit(n)))).docs.map((d) => ({ id: d.id, ...d.data() }));
const patchAutopilot = (db, uid, patch) => setDoc(doc(db, 'users', uid, 'settings', 'autopilot'), patch, { merge: true }).catch(() => {});

export async function runPipelineForUser(db, uid, { cfg = {}, bs = {}, now = Date.now(), deadline = Date.now() + 240000, mailbox, fromName = '', dateKey, hour, dow = null, out = { notes: [] } } = {}) {
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
    // Quota attainment and pipeline velocity: on the first of the month, with the monthly summary.
    let salesNotes = [];
    if (monthly) {
      const team = (await getDoc(doc(db, 'users', uid, 'settings', 'team')).catch(() => null))?.data?.() || {};
      salesNotes = quotaText(quotaLines({ deals, members: team.members || [], year: monthly.year, month: monthly.month }));
      // Revenue by channel over the last 12 months (linear): each won deal's value, split across its source and the emails sent to that customer before the win.
      const sentRows = await getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), limit(2000))).then((s) => s.docs.map((d) => d.data())).catch(() => []);
      const sentBy = new Map();
      for (const e of sentRows) {
        const to = String(e.to || e.recipientEmail || '').trim().toLowerCase();
        const at = Date.parse(e.sentAt || e.createdAt || '');
        if (to && Number.isFinite(at)) sentBy.set(to, [...(sentBy.get(to) || []), at]);
      }
      const custs = deals.filter((d) => d && d.stage === 'closed_won' && d.email).map((d) => {
        const won = Date.parse(d.stageTimes?.closed_won || d.closedAt || '');
        const made = Date.parse(d.createdAt || '');
        const em = String(d.email).trim().toLowerCase();
        const touches = [];
        if (Number.isFinite(made)) touches.push({ channel: d.source || 'unrecorded', at: made });
        for (const at of sentBy.get(em) || []) if (!Number.isFinite(won) || at <= won) touches.push({ channel: 'email', at });
        return { revenue: Number(d.value) || 0, touches, won };
      }).filter((c) => Number.isFinite(c.won) && now - c.won < 365 * 86400000);
      const channels = attributeRevenue(custs, 'linear').slice(0, 5);
      if (channels.length) salesNotes.push(`- Revenue by channel, last 12 months (linear): ${channels.map((c) => `${c.channel} ${c.amount.toFixed(2)}`).join(', ')}.`);
      const v = pipelineVelocityDays(deals, now);
      if (v !== null) salesNotes.push(`- Pipeline velocity: about ${v} days from first contact to a win (last 12 months).`);
    }
    // The week's action list: on Mondays only, from the owner's own records (one extra read of quotes, invoices and tasks).
    let actions = [];
    if (dow === 1) {
      const [quotes, invoices, tasks] = await Promise.all([
        getDocs(query(collection(db, 'users', uid, 'quotes'), limit(300))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
        getDocs(query(collection(db, 'users', uid, 'invoices'), limit(500))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
        getDocs(query(collection(db, 'users', uid, 'follow_up_tasks'), limit(500))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
      ]);
      actions = actionText(buildActionList({ deals, tasks, quotes, invoices, now }));
    }
    const digest = alertsDigest({ stalled, revivals, renewals, monthly, commission, salesNotes, actions, senderName: fromName });
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
