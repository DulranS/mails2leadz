// lib/owner-report.js - the Monday email to the owner: last week's numbers, where the business stands, and the top things to do.
// Pure (no Firebase): tested. Built from the SAME pure functions the Business Value page uses, so the email and the page can never disagree.
import { computeBusinessMetrics } from './business-metrics.js';
import { computeWeeklyKpis, weeklyReportText } from './weekly-kpi.js';
import { computeBilling, computeUnbilled } from './billing.js';
import { computeRecurring, computeSubscriptionsDue } from './recurring.js';
import { computeCustomers } from './customers.js';
import { buildNextActions } from './next-actions.js';
import { makeMoney } from './currency.js';

const toMs = (v) => { if (!v) return null; if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime(); const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null; };

/** Pure: everything the email needs, from already-loaded rows. */
export function buildOwnerReport({ deals = [], invoices = [], sentRows = [], settings = {}, now = Date.now() }) {
  const emailRows = sentRows.map((x) => ({ to: String(x.to || '').toLowerCase(), template: x.template, abTest: x.abTest, angle: x.angle || '', replied: !!x.replied, repliedAt: x.repliedAt || null, t: toMs(x.sentAt) ?? toMs(x.createdAt) ?? 0 })).filter((r) => r.to);
  const since90 = now - 90 * 86400000;
  const recent = sentRows.filter((x) => (toMs(x.sentAt) ?? 0) >= since90);
  const outreach = { sent: recent.length, replied: recent.filter((x) => x.replied).length };
  const m = computeBusinessMetrics({ deals, outreach, settings, emailed: emailRows.map((r) => r.to), now });
  const kpis = computeWeeklyKpis({ emailRows, deals, invoices, avgDealValue: m.settings.avgDealValue, now });
  const billing = computeBilling({ invoices, now });
  const unbilled = computeUnbilled({ deals: m.deals, invoices });
  const rec = computeRecurring({ deals, now });
  const subsDue = computeSubscriptionsDue({ deals, invoices, now });
  const customers = computeCustomers({ deals, invoices, avgDealValue: m.settings.avgDealValue, now });
  const money = makeMoney(m.settings.currency);
  const snapshot = {
    openCount: m.present.openCount, openValue: m.present.openValue, weighted: m.present.weightedPipeline, forecast30: m.future.horizons[0].expected,
    outstanding: billing.outstanding, overdueCount: billing.overdue.count, overdueAmount: billing.overdue.amount,
    customers: customers.total, atRiskCount: customers.atRisk.count, openIssues: customers.openIssues,
    ...(rec.any ? { mrr: rec.mrr, subscribers: rec.subscribers, netNewMrr30: rec.netNewMrr30, renewalsSoon: rec.renewals.dueSoon.count } : {}),
  };
  const businessName = settings?.profile?.businessName || '';
  const actions = buildNextActions({ metrics: m, monthlyGoal: Number(settings?.monthlyGoal) || 0, hasProfile: !!settings?.profile?.offer, sentRecently: outreach.sent, billing, unbilled, customers, subsDue, recurring: rec }).slice(0, 3);
  const base = weeklyReportText({ kpis, snapshot, money, businessName, now });
  const todo = actions.length ? `\n\nDO THIS NEXT\n${actions.map((a, i) => `${i + 1}. ${a.title}`).join('\n')}` : '';
  return { subject: `Your weekly report${businessName ? ` - ${businessName}` : ''}`, body: `${base}${todo}\n\nSent automatically by AutoLeads. Open Business Value for the full picture.`, quiet: !!kpis.noActivity && !actions.length };
}

