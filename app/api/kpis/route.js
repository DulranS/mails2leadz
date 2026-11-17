// app/api/kpis/route.js - the sales, buy-side, speed and support measures for the signed-in owner. Read once when the screen opens.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { collection, doc, getDoc, getDocs, query, where, limit } from '../../../lib/server-firestore.js';
import { listTargets } from '../../../lib/server/deals.js';
import { ticketsFor } from '../../../lib/server/support-queue.js';
import { salesKpis } from '../../../lib/sales-kpis.js';
import { economicsFor, saveBusinessProfile } from '../../../lib/server/economics.js';
import { quarterForecast, dealHealth } from '../../../lib/health.js';
import { demandTrend } from '../../../lib/demand.js';
import { repScorecard } from '../../../lib/insights.js';
import { creditRisk } from '../../../lib/credit-risk.js';
import { trustScore } from '../../../lib/trust.js';
import { slaStatus } from '../../../lib/support-routing.js';
import { daysSalesOutstanding } from '../../../lib/payment-metrics.js';
import { funnelRates } from '../../../lib/funnel.js';
import { csatSummary, deflectionRate } from '../../../lib/customer-links.js';
import { paybackMonths, pipelineCoverage, netRevenueRetention } from '../../../lib/revenue-kpis.js';

import { customDayRange, asOfTime } from '../../../lib/kpi-range.js';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const [deals, leads, targets, support] = await Promise.all([
    getDocs(query(collection(db, 'deals'), where('userId', '==', who.uid), limit(1000))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
    getDocs(query(collection(db, 'lead_inbox'), where('userId', '==', who.uid), limit(2000))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
    listTargets(db, who.uid).catch(() => []),
    ticketsFor(db, who.uid).catch(() => ({ tickets: [], kpis: null })),
  ]);
  const money = await economicsFor(db, who.uid).catch(() => null);
  const now = Date.now();
  // The window the lead, deal, spend and funnel figures cover: 3, 6 or 12 months back (default 12), or an exact from-to range.
  const asked = Number(request.nextUrl.searchParams.get('months'));
  const range = customDayRange(request.nextUrl.searchParams.get('from'), request.nextUrl.searchParams.get('to'), now);
  const months = range ? range.months : ([3, 6, 12].includes(asked) ? asked : 12);
  const end = range ? range.end : now;
  const asOf = asOfTime(range, now);
  const WINDOW = range ? range.end - range.start : Math.round(months * 30.44 * 86400000);
  const HALF = 180 * 86400000;
  const forecast = quarterForecast({ deals, monthlyTarget: money?.targets?.monthlyRevenue || 0, now: asOf });
  const atRisk = deals.map((d) => ({ name: d.businessName || d.email || 'Deal', value: d.value || 0, health: dealHealth(d, asOf) })).filter((d) => d.health && d.health.status === 'at_risk').sort((a, b) => b.value - a.value).slice(0, 5);
  const demand = demandTrend(leads, now);
  const teamDoc = (await getDoc(doc(db, 'users', who.uid, 'settings', 'team')).catch(() => null))?.data?.() || {};
  const memberList = Array.isArray(teamDoc.members) ? teamDoc.members : [];
  const invoiceRows = (await getDocs(query(collection(db, 'invoices'), where('userId', '==', who.uid), limit(1000))).then((x) => x.docs.map((d) => d.data())).catch(() => []));
  const credit = creditRisk(invoiceRows, now);
  const dso = daysSalesOutstanding(invoiceRows, now);
  const inWindow = (t) => t && Date.parse(t) <= end && end - Date.parse(t) <= WINDOW;
  const spendRows = (await getDocs(query(collection(db, 'users', who.uid, 'marketing_spend'), limit(200))).then((x) => x.docs.map((d) => d.data())).catch(() => []));
  const monthCut = new Date(end - WINDOW).toISOString().slice(0, 7);
  const spendWin = spendRows.filter((r) => String(r.month || '') >= monthCut).reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const leadsWin = leads.filter((l) => inWindow(l.receivedAt)).length;
  const qualifiedWin = deals.filter((d) => inWindow(d.stageTimes?.qualified)).length;
  const wonWin = deals.filter((d) => d.stage === 'closed_won' && inWindow(d.stageTimes?.closed_won)).length;
  const wonEmails = new Map();
  for (const d of deals) if (d.stage === 'closed_won' && d.email) wonEmails.set(String(d.email).toLowerCase(), Math.max(wonEmails.get(String(d.email).toLowerCase()) || 0, Date.parse(d.stageTimes?.closed_won || d.closedAt || '') || 0));
  const lastInvoice = new Map();
  for (const i of invoiceRows) { const e = String(i.email || '').toLowerCase(); const t = Date.parse(i.issuedAt || i.createdAt || '') || 0; if (e && t > (lastInvoice.get(e) || 0)) lastInvoice.set(e, t); }
  const atStart = [...wonEmails.entries()].filter(([, t]) => t && end - t > WINDOW);
  const churned = atStart.filter(([e]) => now - (lastInvoice.get(e) || wonEmails.get(e) || 0) > HALF).length;
  const paidTotal = invoiceRows.filter((i) => i.status === 'paid').reduce((a, i) => a + (Number(i.amountPaid || i.total || i.amount) || 0), 0);
  const payers = new Set(invoiceRows.filter((i) => i.status === 'paid').map((i) => String(i.email || '').toLowerCase()).filter(Boolean)).size;
  const openPipeline = deals.filter((d) => !['closed_won', 'closed_lost'].includes(d.stage)).reduce((a, d) => a + (Number(d.value) || 0), 0);
  const remaining = forecast && forecast.target ? Math.max(0, Number(forecast.target) - Number(forecast.wonThisQuarter || 0)) : null;
  const paidAll = invoiceRows.filter((i) => i.status === 'paid' && i.email);
  const paidWin = paidAll.filter((i) => inWindow(i.paidAt)).reduce((a, i) => a + (Number(i.amountPaid || i.total || i.amount) || 0), 0);
  const payersWin = new Set(paidAll.filter((i) => inWindow(i.paidAt)).map((i) => String(i.email).toLowerCase())).size;
  const savedBiz = (await getDoc(doc(db, 'users', who.uid, 'settings', 'business')).then((s) => s.data() || {}).catch(() => ({})));
  const ticketRows = (await getDocs(query(collection(db, 'users', who.uid, 'support_tickets'), limit(300))).then((x) => x.docs.map((d) => d.data())).catch(() => []));
  const funnel = funnelRates({ spend: spendWin || null, leads: leadsWin, qualified: qualifiedWin, won: wonWin, newCustomers: wonWin, customersAtStart: atStart.length, customersLost: churned, ltv: payers ? paidTotal / payers : null });
  const revenueFigures = {
    paybackMonths: paybackMonths(funnel.costPerNewCustomer, payersWin ? paidWin / payersWin / 12 : null, savedBiz.grossMarginPct),
    pipelineCoverage: pipelineCoverage(openPipeline, remaining),
    netRevenueRetention: netRevenueRetention(invoiceRows, now),
    needsGrossMargin: !(Number(savedBiz.grossMarginPct) > 0),
  };
  const supportFigures = { csat: csatSummary(ticketRows, now), deflectionPct: deflectionRate(ticketRows, now) };
  const webSaved = savedBiz.webTotals || {};
  const answered = ticketRows.length ? Math.round((ticketRows.filter((t) => slaStatus(t, now) !== 'breached').length / ticketRows.length) * 100) : null;
  const trust = trustScore({ supportTargetMetPct: answered, openComplaints: ticketRows.filter((t) => t.status !== 'resolved' && t.kind === 'complaint').length, creditRiskCount: credit.length });
  const reps = repScorecard(deals, now).map((r) => ({ ...r, name: r.owner === 'unassigned' ? 'Unassigned' : (memberList.find((m) => String(m.id) === String(r.owner))?.name || 'Team member') }));
  // `support` is the support figures (csat, deflection); the ticket queue summary stays in `kpis` (salesKpis reads it).
  return NextResponse.json({ months, kpis: salesKpis({ deals, leads, targets, tickets: support.tickets }), support: supportFigures, money, forecast, atRisk, demand, reps, creditRisk: credit, trust, dso, funnel, web: webSaved, revenue: revenueFigures }, { headers: NO_STORE });
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  return NextResponse.json(await saveBusinessProfile(db, who.uid, body || {}), { headers: NO_STORE });
}
