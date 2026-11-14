// lib/server/today-actions.js - counts what needs a person today, from the data the app already holds. Never throws; a missing source counts as zero.
import { collection, doc, getDoc, getDocs, query, where, limit } from '../server-firestore.js';
import { endingSoon } from '../offers.js';
import { lowStockItems } from '../catalog.js';
import { wonNotInvoiced } from '../payment-metrics.js';
import { buildTodayActions } from '../today-actions.js';
import { slaStatus } from '../support-routing.js';
import { dealHealth } from '../health.js';
import { staleListings } from '../deals/resale.js';
import { listTargets } from './deals.js';
import { dueJourneyActions } from './journeys.js';

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
  const open = tickets.filter((t) => t.status !== 'resolved');
  const past = open.filter((t) => slaStatus(t, now) === 'breached').length;
  return {
    supportPastTarget: past,
    supportOpen: open.length - past,
    leadsWaiting: leads.length,
    dealsAtRisk: deals.filter((d) => dealHealth(d, now)?.status === 'at_risk').length,
    journeyStepsDue: journeys.length,
    broadcastDrafts: broadcasts.filter((b) => b.status === 'draft').length,
    socialDrafts: social.filter((s) => s.status === 'draft').length,
    listingsToDecide: staleListings(targets, now).length,
    offersEndingSoon: endingSoon(biz.offers || [], now).length,
    stockLow: lowStockItems(biz.catalog || [], now).length,
    wonNotInvoiced: wonNotInvoiced(deals, await rows(getDocs(query(collection(db, 'users', uid, 'invoices'), limit(500)))), now).length,
    restockWaiting: (() => { const waiting = new Set((waitRows || []).map((w) => String(w.subject).toLowerCase())); return (biz.catalog || []).filter((i) => waiting.has(String(i.name).toLowerCase()) && (i.stock === null || i.stock === undefined || i.stock > 0)).length; })(),
    eventsSoon: events.filter((e) => { const s = Date.parse(e.startsAt); return s > now && s - now <= 3 * DAY; }).length,
  };
}

export async function todayItems(db, uid, now = Date.now()) {
  return buildTodayActions(await todayCounts(db, uid, now));
}
