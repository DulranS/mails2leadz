// lib/server/today-actions.js - counts what needs a person today, from the data the app already holds. Never throws; a missing source counts as zero.
import { collection, doc, getDoc, getDocs, query, where, limit } from '../server-firestore.js';
import { endingSoon } from '../offers.js';
import { lowStockItems } from '../catalog.js';
import { wonNotInvoiced } from '../payment-metrics.js';
import { salesRedFlags } from '../sales-red-flags.js';
import { birthdaysDueToday } from '../birthdays.js';
import { upsellReadyCount } from './upsell.js';
import { buildTodayActions } from '../today-actions.js';
import { slaStatus } from '../support-routing.js';
import { dealHealth } from '../health.js';
import { staleListings } from '../deals/resale.js';
import { listTargets } from './deals.js';
import { dueJourneyActions } from './journeys.js';
import { tasksSummary } from '../task-rules.js';
import { unsentInvoiceCount } from '../retry-rules.js';
import { failingServices } from '../integration-health.js';
import { ownerOffsetMin } from './owner-clock.js';
import { openAlertCount } from '../reviews.js';

const DAY = 86400000;
const rows = (p) => p.then((s) => s.docs.map((d) => d.data())).catch(() => []);

export async function todayCounts(db, uid, now = Date.now()) {
  const [tickets, leads, deals, broadcasts, social, events, targets, journeys] = await Promise.all([
    rows(getDocs(query(collection(db, 'users', uid, 'support_tickets'), limit(300)))),
    rows(getDocs(query(collection(db, 'lead_inbox'), where('userId', '==', uid), where('status', '==', 'new'), limit(500)))),
    rows(getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(500)))),
    rows(getDocs(query(collection(db, 'users', uid, 'broadcasts'), limit(50)))),
    rows(getDocs(query(collection(db, 'users', uid, 'social_drafts'), limit(50)))),
    rows(getDocs(query(collection(db, 'public_events'), where('userId', '==', uid), limit(50)))),
    listTargets(db, uid).catch(() => []),
    dueJourneyActions(db, uid, now).catch(() => []),
  ]);
  const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).then((x) => x.data() || {}).catch(() => ({})));
  const waitRows = await rows(getDocs(query(collection(db, 'users', uid, 'waitlist'), limit(500))));
  const invoiceRows = await rows(getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), limit(500))));
  const missedCalls = (await rows(getDocs(query(collection(db, 'lead_inbox'), where('userId', '==', uid), where('status', '==', 'new'), limit(500))))).filter((l) => l.source === 'Missed call').length;
  const noShows = (await rows(getDocs(query(collection(db, 'users', uid, 'bookings'), where('status', '==', 'no_show'), limit(200))))).filter((b) => !b.rebookedAt && now - (Date.parse(b.statusAt || '') || 0) <= 7 * DAY).length;
  const agreed = new Set(deals.filter((d) => d.marketingConsent === true).map((d) => String(d.email || '').toLowerCase()));
  const birthdayCount = birthdaysDueToday(biz.birthdays || {}, now, agreed).length;
  const redFlagCount = salesRedFlags({ deals, invoices: invoiceRows, now }).length;
  const upsellReady = await upsellReadyCount(db, uid, now);
  const open = tickets.filter((t) => t.status !== 'resolved');
  const past = open.filter((t) => slaStatus(t, now) === 'breached').length;
  // Follow-up drafts the sender has prepared and is waiting for you to approve (the approval centre is this list on Today).
  const draftsReady = await rows(getDocs(query(collection(db, 'draft_queue'), where('userId', '==', uid), where('status', '==', 'ready'), limit(200))));
  const taskRows = await rows(getDocs(query(collection(db, 'users', uid, 'tasks'), limit(200))));
  const taskOffset = await ownerOffsetMin(db, uid, now);
  // Automatic invoices are in the top-level collection the daily job writes to.
  const sentInvoices = await rows(getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), limit(500))));
  return {
    draftsToApprove: draftsReady.length,
    tasksNeedAttention: tasksSummary(taskRows, now, taskOffset).needsAttention,
    invoicesNotSent: unsentInvoiceCount(sentInvoices),
    integrationsFailing: failingServices(await getDoc(doc(db, 'users', uid, 'settings', 'integration_health')).then((x) => x.data?.() || {}).catch(() => ({}))).length,
    // Invoices autopilot held back (over your limit, or a bounced address) and that nobody has sent yet.
    invoicesToApprove: invoiceRows.filter((i) => i.heldReason && !i.emailedAt && i.status !== 'paid').length,
    supportPastTarget: past,
    supportOpen: open.length - past,
    leadsWaiting: leads.length,
    dealsAtRisk: deals.filter((d) => dealHealth(d, now)?.status === 'at_risk').length,
    journeyStepsDue: journeys.length,
    broadcastDrafts: broadcasts.filter((b) => b.status === 'draft').length,
    socialDrafts: social.filter((s) => s.status === 'draft').length,
    listingsToDecide: staleListings(targets, now).length,
    offersEndingSoon: endingSoon(biz.offers || [], now).length,
    missedCallsToReturn: missedCalls,
    noShowsToRebook: noShows,
    birthdaysToday: birthdayCount,
    salesRedFlags: redFlagCount,
    upsellReady,
    stockLow: lowStockItems(biz.catalog || [], now).length,
    wonNotInvoiced: wonNotInvoiced(deals, await rows(getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), limit(500)))), now).length,
    restockWaiting: (() => { const waiting = new Set((waitRows || []).map((w) => String(w.subject).toLowerCase())); return (biz.catalog || []).filter((i) => waiting.has(String(i.name).toLowerCase()) && (i.stock === null || i.stock === undefined || i.stock > 0)).length; })(),
    // Logged reviews of 2 stars or fewer that nobody has marked answered (pass 341).
    badReviewAlerts: openAlertCount(await rows(getDocs(query(collection(db, 'users', uid, 'reviews'), limit(300))))),
    eventsSoon: events.filter((e) => { const s = Date.parse(e.startsAt); return s > now && s - now <= 3 * DAY; }).length,
  };
}

export async function todayItems(db, uid, now = Date.now()) {
  return buildTodayActions(await todayCounts(db, uid, now));
}
