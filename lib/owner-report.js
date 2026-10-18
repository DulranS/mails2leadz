// lib/owner-report.js - the Monday email to the owner: last week's numbers, where the business stands, and the top things to do.
// Pure (no Firebase): tested. Built from the SAME pure functions the Business Value page uses, so the email and the page can never disagree.
import { computeBusinessMetrics } from './business-metrics.js';
import { computeWeeklyKpis, weeklyReportText } from './weekly-kpi.js';
import { computeBilling, computeUnbilled } from './billing.js';
import { computeRecurring, computeSubscriptionsDue } from './recurring.js';
import { computeCustomers } from './customers.js';
import { buildNextActions } from './next-actions.js';
import { makeMoney } from './currency.js';
import { PROSPECT_STAGES, normalizeStage } from './deal-utils.js';
import { contentActionInfo } from './content.js';

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


/**
 * The short morning email: only what needs the owner TODAY (urgent and warning items, posts due, a stopped Autosend). Nothing to say = quiet = no email.
 * Pure. `autopilot` is { settings, lastAutoSend } from the autopilot settings doc; `tasks` the pending follow-up tasks; `inbox` the Lead Inbox rows.
 */
export function buildMorningBrief({ deals = [], invoices = [], sentRows = [], posts = [], tasks = [], inbox = [], settings = {}, autopilot = null, today = '', baseUrl = '', now = Date.now() }) {
  const emailRows = sentRows.map((x) => ({ to: String(x.to || x.recipientEmail || '').toLowerCase(), template: x.template, abTest: x.abTest, angle: x.angle || '', replied: !!x.replied, repliedAt: x.repliedAt || null, t: toMs(x.sentAt) ?? toMs(x.createdAt) ?? 0 })).filter((r) => r.to);
  const since90 = now - 90 * 86400000;
  const recent = sentRows.filter((x) => (toMs(x.sentAt) ?? 0) >= since90);
  const outreach = { sent: recent.length, replied: recent.filter((x) => x.replied).length };
  const m = computeBusinessMetrics({ deals, outreach, settings, emailed: emailRows.map((r) => r.to), now });
  const billing = computeBilling({ invoices, now });
  const unbilled = computeUnbilled({ deals: m.deals, invoices });
  const rec = computeRecurring({ deals, now });
  const subsDue = computeSubscriptionsDue({ deals, invoices, now });
  const customers = computeCustomers({ deals, invoices, avgDealValue: m.settings.avgDealValue, now });
  // People who replied but have no deal yet, and follow-ups that are due (a reply ends a sequence).
  const engaged = new Set(deals.filter((d) => !PROSPECT_STAGES.includes(normalizeStage(d.stage))).map((d) => String(d.email || '').toLowerCase()));
  const repliedTo = new Set(emailRows.filter((r) => r.replied).map((r) => r.to));
  const unconverted = [...repliedTo].filter((e) => !engaged.has(e)).map((email) => ({ email, business: sentRows.find((x) => String(x.to || x.recipientEmail || '').toLowerCase() === email)?.businessName || '' }));
  const dueFollowUps = tasks.filter((x) => x.status === 'pending' && !repliedTo.has(String(x.leadEmail || '').toLowerCase()) && (toMs(x.scheduledFor) ?? Infinity) <= now).length;
  const hotWithEmail = inbox.filter((x) => x.status === 'new' && x.lead_quality === 'HOT' && !!x.email).length;
  const list = buildNextActions({
    metrics: m, unconvertedReplies: unconverted, dueFollowUps, monthlyGoal: Number(settings?.monthlyGoal) || 0, hasProfile: !!settings?.profile?.offer,
    sentRecently: outreach.sent, billing, unbilled, customers, subsDue, recurring: rec, inbox: { hotWithEmail }, content: today ? contentActionInfo(posts, today) : null, autopilot, limit: 50,
  });
  // The brief is for things that need a person today: urgent or warning items, posts due, and a stopped Autosend. "Info" items stay on the Business page.
  const items = list.filter((a) => a.priority <= 2 || a.id === 'content' || a.id === 'autosend_paused').slice(0, 5);
  const businessName = settings?.profile?.businessName || '';
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const lines = items.map((a, i) => `${i + 1}. ${a.title}\n   ${a.detail}${base ? `\n   ${base}${a.href}` : ''}`);
  const subject = items.length === 1 ? `1 thing needs you today${businessName ? ` - ${businessName}` : ''}` : `${items.length} things need you today${businessName ? ` - ${businessName}` : ''}`;
  return { subject, body: `Good morning. Here is what needs you today:\n\n${lines.join('\n\n')}\n\nSent automatically by AutoLeads, and only on days something needs you. Switch it off in Account, Autopilot.`, quiet: items.length === 0, count: items.length };
}
