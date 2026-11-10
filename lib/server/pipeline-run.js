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
import { staleNewLeads } from '../speed-to-lead.js';
import { abStats, pickWinner } from '../ab-winner.js';
import { viewedNoAnswer } from '../quote-followup.js';
import { kpiScorecard, scorecardText } from '../kpi-scorecard.js';
import { planSupportAlerts } from '../support-alerts.js';
import { recheckTargets, listTargets } from './deals.js';
import { openTicketFor } from './support-queue.js';
import { slaStatus } from '../support-routing.js';
import { syncProductsToShopify } from './shopify-sync.js';
import { syncProductsToEbay } from './ebay-sync.js';
import { searchUndervalued } from './ebay-discovery.js';
import { weekSeoOpportunities } from './search-console.js';
import { channelRoi, budgetSuggestion, ltvBySource } from '../roi-loop.js';
import { staleListings } from '../deals/resale.js';
import { promoResults, promoText } from '../promo-results.js';
import { sendOwnerPush } from './push.js';
import { secretsFor } from './integration-secrets.js';
import { checkOpenRequests } from './esign.js';
import { sendRentalTexts, weeklyOutreach } from './gap-tools.js';
import { dueJourneyActions } from './journeys.js';
import { weeklyPlacesLeads } from './places-leads.js';
import { eventReminders } from './events.js';
import { correctiveActions, paidFigures } from '../corrective.js';
import { lifetimeValueByEmail } from '../sales-metrics.js';

const rows = async (db, coll, uid, n) => (await getDocs(query(collection(db, coll), where('userId', '==', uid), limit(n)))).docs.map((d) => ({ id: d.id, ...d.data() }));
const patchAutopilot = (db, uid, patch) => setDoc(doc(db, 'users', uid, 'settings', 'autopilot'), patch, { merge: true }).catch(() => {});

// The deals a daily run needs: open deals (stall alerts), won deals (renewals) and recent losses (revival). Bounded per group.
// Monthly figures need every deal, so the first of the month still reads them all (see the caller).
const CLOSED_STAGES = ['closed_lost', 'closed_won', 'delivery', 'retention', 'expansion'];
async function dailyDeals(db, uid) {
  const col = collection(db, 'deals');
  const [open, won, lost] = await Promise.all([
    getDocs(query(col, where('userId', '==', uid), where('stage', 'not-in', CLOSED_STAGES), limit(1500))),
    getDocs(query(col, where('userId', '==', uid), where('stage', 'in', ['closed_won', 'delivery', 'retention', 'expansion']), limit(400))),
    getDocs(query(col, where('userId', '==', uid), where('stage', '==', 'closed_lost'), limit(300))),
  ]);
  return [...open.docs, ...won.docs, ...lost.docs].map((d) => ({ id: d.id, ...d.data() }));
}

export async function runPipelineForUser(db, uid, { cfg = {}, bs = {}, now = Date.now(), deadline = Date.now() + 240000, mailbox, fromName = '', dateKey, hour, dow = null, out = { notes: [] } } = {}) {
  try {
    const alertsCol = collection(db, 'users', uid, 'pipeline_alerts');
    const [deals, existing] = await Promise.all([(dateKey || '').endsWith('-01') ? rows(db, 'deals', uid, 2000) : dailyDeals(db, uid), getDocs(query(alertsCol, where('createdAt', '>=', new Date(now - 90 * 86400000).toISOString()), limit(1500))).then((s) => s.docs.map((d) => d.data()))]);
    const stalled = planStallAlerts({ deals, tasks: existing, now, stallDays: stallThresholds(bs?.stallDays) });
    const revivals = planLostRevivals({ deals, tasks: existing, now });
    const renewals = planRenewalAlerts({ deals, tasks: existing, now });
    for (const a of [...stalled, ...revivals, ...renewals]) {
      if (Date.now() > deadline - 20000) { out.notes.push('time'); break; }
      await addDoc(alertsCol, { ...a.task, createdAt: new Date(now).toISOString() });
    }
    // Quote follow-up: a quote the customer opened and left unanswered gets one alert (per quote). Reads only quotes that were viewed.
    const viewedQuotes = await getDocs(query(collection(db, 'users', uid, 'quotes'), where('viewCount', '>', 0), limit(300))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []);
    const quoteSeen = new Set(existing.filter((t) => t && t.kind === 'quote_viewed').map((t) => t.stageKey));
    for (const q of viewedNoAnswer(viewedQuotes, now)) {
      const key = `quote:${q.id}`;
      if (quoteSeen.has(key) || Date.now() > deadline - 20000) continue;
      quoteSeen.add(key);
      await addDoc(alertsCol, { leadEmail: q.email, kind: 'quote_viewed', stageKey: key, stage: 'quote', scheduledFor: new Date(now).toISOString(), reason: `Opened "${q.title}" ${q.daysSince} days ago (${q.viewCount} views) and has not answered. A short follow-up is worth considering.`, status: 'pending', completedAt: null, createdAt: new Date(now).toISOString() });
    }
    // Speed to lead: a new inbound lead with no first reply after an hour gets one alert (per lead).
    const leadRows = await getDocs(query(collection(db, 'lead_inbox'), where('userId', '==', uid), limit(300))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []);
    const speedSeen = new Set(existing.filter((t) => t && t.kind === 'speed_to_lead').map((t) => t.stageKey));
    const speed = [];
    for (const w of staleNewLeads(leadRows, now, 1)) {
      const key = `lead:${w.id}`;
      if (speedSeen.has(key)) continue;
      speedSeen.add(key);
      speed.push({ email: w.email, task: { leadEmail: w.email, kind: 'speed_to_lead', stageKey: key, stage: 'new', scheduledFor: new Date(now).toISOString(), reason: `New lead waiting ${w.hoursWaiting} hours for a first reply.`, status: 'pending', completedAt: null } });
    }
    for (const a of speed) {
      if (Date.now() > deadline - 20000) break;
      await addDoc(alertsCol, { ...a.task, createdAt: new Date(now).toISOString() });
    }
    // Complaints and support requests that have waited two hours for an answer: one alert each.
    const supportRows = await getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), where('replyIntent', 'in', ['complaint', 'support_request']), limit(200))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []);
    const supportSeen = new Set(existing.filter((t) => t && t.kind === 'support_waiting').map((t) => t.stageKey));
    for (const a of planSupportAlerts(supportRows, supportSeen, now)) {
      if (Date.now() > deadline - 20000) break;
      await addDoc(alertsCol, { ...a, scheduledFor: new Date(now).toISOString(), status: 'pending', completedAt: null, createdAt: new Date(now).toISOString() });
      await openTicketFor(db, uid, a, now);
    }
    // Listings: changed products go to the owner's own store (no-op when nothing changed or no store is connected).
    await syncProductsToShopify(db, uid, { now });
    await syncProductsToEbay(db, uid, { now });
    // A support ticket past its two-hour target: one alert to the owner, once.
    const openTickets = await getDocs(query(collection(db, 'users', uid, 'support_tickets'), where('status', '!=', 'resolved'), limit(200))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []);
    const breachSeen = new Set(existing.filter((t) => t && t.kind === 'support_breach').map((t) => t.stageKey));
    for (const tk of openTickets.filter((x) => slaStatus(x, now) === 'breached')) {
      const key = `breach:${tk.id}`;
      if (breachSeen.has(key) || Date.now() > deadline - 20000) continue;
      breachSeen.add(key);
      await addDoc(alertsCol, { leadEmail: tk.customerEmail || '', kind: 'support_breach', stageKey: key, stage: tk.kind || 'support_request', scheduledFor: new Date(now).toISOString(), reason: `A ${tk.kind === 'complaint' ? 'complaint' : 'support question'} is past its two-hour target${tk.assignedName ? ` (with ${tk.assignedName})` : ' and has no one assigned'}. Answer it now.`, status: 'pending', completedAt: null, createdAt: new Date(now).toISOString() });
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
      salesNotes.push(...scorecardText(kpiScorecard({ leads: await getDocs(query(collection(db, 'lead_inbox'), where('userId', '==', uid), limit(1000))).then((s) => s.docs.map((d) => d.data())).catch(() => []), deals, year: monthly.year, month: monthly.month })));
      const channels = attributeRevenue(custs, 'linear').slice(0, 5);
      const spendRow = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.()?.spendByChannel || {};
      const roiRows = channelRoi(attributeRevenue(custs, 'linear'), spendRow);
      const advice = budgetSuggestion(roiRows);
      if (advice) salesNotes.push(`- Budget: ${advice}`);
      const invRowsForLtv = await getDocs(query(collection(db, 'users', uid, 'invoices'), limit(1000))).then((x) => x.docs.map((d) => d.data())).catch(() => []);
      const sourceValue = ltvBySource(deals.filter((d) => d && d.email && d.stage === 'closed_won').map((d) => ({ email: d.email, source: d.source })), lifetimeValueByEmail(invRowsForLtv));
      for (const s of sourceValue.slice(0, 3)) salesNotes.push(`- Customers from ${s.source}: ${s.customers}, worth about ${s.averageLtv} each over time.`);
      if (channels.length) salesNotes.push(`- Revenue by channel, last 12 months (linear): ${channels.map((c) => `${c.channel} ${c.amount.toFixed(2)}`).join(', ')}.`);
      const v = pipelineVelocityDays(deals, now);
      if (v !== null) salesNotes.push(`- Pipeline velocity: about ${v} days from first contact to a win (last 12 months).`);
    }
    // The week's action list: on Mondays only, from the owner's own records (one extra read of quotes, invoices and tasks).
    let actions = [];
    let dealAlerts = [];
    let dealStale = [];
    let dealFound = 0;
    // Rental check-out and extension texts: sent when switched on, otherwise listed for you.
    const rentals = await sendRentalTexts(db, uid, { now });
    const rentalLines = [...rentals.pending];
    for (const j of await dueJourneyActions(db, uid, now)) rentalLines.push(`- Send step ${j.stepIndex + 1} of ${j.total} of "${j.journey}" to ${j.email} (${j.channel}): ${j.text.slice(0, 160)}`);
    // A/B winner: checked on Mondays, only while no winner has been stored (so a decided test costs nothing more to read).
    if (dow === 1 && !(stored.abWinner && stored.abWinner.template)) {
      const abRows = await getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), where('abTest', '==', true), limit(5000))).then((s) => s.docs.map((d) => d.data())).catch(() => []);
      const pick = pickWinner(abStats(abRows));
      if (pick.winner) {
        await patchAutopilot(db, uid, { abWinner: { template: pick.winner, decidedAt: new Date(now).toISOString(), reason: pick.reason } });
        salesNotes.push(`- A/B test: version ${pick.winner} is now sent to everyone. ${pick.reason}`);
      }
    }
    if (dow === 1) {
      const [quotes, invoices, tasks] = await Promise.all([
        getDocs(query(collection(db, 'users', uid, 'quotes'), limit(300))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
        getDocs(query(collection(db, 'users', uid, 'invoices'), limit(500))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
        getDocs(query(collection(db, 'users', uid, 'follow_up_tasks'), limit(500))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
      ]);
      const teamDoc = (await getDoc(doc(db, 'users', uid, 'settings', 'team')).catch(() => null))?.data?.() || {};
      // Buy side: tracked companies are checked again; only new red flags are reported (added to the week's actions below).
      dealAlerts = (await recheckTargets(db, uid, { now })).alerts;
      dealStale = staleListings(await listTargets(db, uid), now);
      const found = await searchUndervalued(db, uid, { now });
      if (found.added) dealFound = found.added;
      const productNames = Object.fromEntries(await getDocs(query(collection(db, 'users', uid, 'products'), limit(300))).then((x) => x.docs.map((d) => [d.id, d.data().name || 'a product'])).catch(() => []));
      const supportTickets = await getDocs(query(collection(db, 'users', uid, 'support_tickets'), limit(300))).then((s) => s.docs.map((d) => d.data())).catch(() => []);
      actions = actionText(buildActionList({ deals, tasks, quotes, invoices, members: teamDoc.members || [], productNames, tickets: supportTickets, now }));
      for (const l of rentalLines) actions.push(l);
      const biz0 = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
      for (const a of correctiveActions({ targets: biz0.targets || {}, ...paidFigures(invoices, now) })) actions.push(`- ${a}`);
      for (const l of await eventReminders(db, uid, now)) actions.push(l);
      const places = await weeklyPlacesLeads(db, uid);
      if (places.queued) actions.push(`- ${places.queued} local businesses found for your saved searches and queued for review in the lead finder.`);
      const outreach = await weeklyOutreach(db, uid, now);
      for (const l of outreach.lines) actions.push(l);
      const signing = await checkOpenRequests(db, uid, fetch, now);
      for (const s of signing.signed) actions.push(`- Signed: ${s.title}, by ${s.signerEmail}. File it and start the work.`);
      const gsc = await secretsFor(db, uid, ['GSC_REFRESH_TOKEN'], { env: process.env }).catch(() => ({}));
      if (gsc.GSC_REFRESH_TOKEN) {
        const seo = await weekSeoOpportunities(gsc.GSC_REFRESH_TOKEN, process.env, fetch, now);
        for (const o of seo.opportunities) actions.push(`- Search "${o.query}": ${o.why}`);
      }
      if (dealFound) actions.push(`- ${dealFound} new listing${dealFound === 1 ? '' : 's'} below the usual price for your saved searches: check the sold prices, then decide`);
      for (const s of dealStale) actions.push(`- Decide on the listing ${s.name}: open ${s.days} days with no move (re-price it or drop it)`);
      for (const a of dealAlerts) actions.push(`- Company check, ${a.name}: new red flag${a.fresh.length > 1 ? 's' : ''}: ${a.fresh.join(' ')}`);
    }
    // Discount codes: last month's uses, revenue and discount, on the first of the month.
    if (monthly) {
      const invRows = await getDocs(query(collection(db, 'users', uid, 'invoices'), limit(1000))).then((s) => s.docs.map((d) => d.data())).catch(() => []);
      salesNotes.push(...promoText(promoResults(invRows, monthly.year, monthly.month)));
    }
    const digest = alertsDigest({ stalled, revivals, renewals, monthly, commission, salesNotes, actions, speed: speed.map((a) => ({ task: a.task })), senderName: fromName });
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
