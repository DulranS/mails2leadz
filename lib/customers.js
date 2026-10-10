// lib/customers.js - everyone who already bought: onboarding, activation, support issues and account health.
// Pure functions over the owner's real deals and invoices. No invented scores: every flag says why it is raised.

import { WON_STAGES, PIPELINE_STAGES, normalizeStage } from './deal-utils.js';
import { onboardingProgress, openIssues, sanitizeIssues, qualificationSummary, ONBOARDING_STEPS } from './deal-extras.js';
import { invoiceState } from './billing.js';

const DAY = 86400000;
export const AT_RISK_QUIET_DAYS = 45; // no contact with a customer for this long = at risk
export const ONBOARDING_STUCK_DAYS = 7; // won this long ago and still not activated
export const ISSUE_URGENT_DAYS = 3; // an issue open this long needs an answer

const toMs = (v) => {
  if (!v) return null;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

/** Which check-in email fits where this customer is in their life with you (maps to the AI check-in purposes). */
export function suggestedCheckin(daysSinceWon) {
  const d = daysSinceWon ?? 0;
  if (d < 3) return { purpose: 'onboarding', label: 'Welcome' };
  if (d < 21) return { purpose: 'delivery_check', label: 'How is it going?' };
  if (d < 75) return { purpose: 'upsell_opportunity', label: 'One-month check-in' };
  return { purpose: 'quarterly_review', label: 'Quarterly review' };
}

export function computeCustomers({ deals = [], invoices = [], avgDealValue = 1000, now = Date.now() } = {}) {
  const avg = Number(avgDealValue) > 0 ? Number(avgDealValue) : 1000;
  const overdueByEmail = new Map();
  for (const inv of invoices) {
    if (!inv?.email) continue;
    const { state, daysOverdue } = invoiceState(inv, now);
    if (state !== 'overdue') continue;
    const k = String(inv.email).toLowerCase();
    const row = overdueByEmail.get(k) || { count: 0, amount: 0, oldestDays: 0 };
    row.count += 1;
    row.amount += Number(inv.amount) || 0;
    row.oldestDays = Math.max(row.oldestDays, daysOverdue);
    overdueByEmail.set(k, row);
  }

  // one deal per email (latest wins), same rule as the metrics
  const byEmail = new Map();
  for (const d of deals) {
    if (!d?.email) continue;
    const k = String(d.email).toLowerCase();
    const prev = byEmail.get(k);
    if (!prev || (toMs(d.lastUpdate) || 0) >= (toMs(prev.lastUpdate) || 0)) byEmail.set(k, d);
  }

  const customers = [];
  const resolveDays = [];
  for (const d of byEmail.values()) {
    const stage = normalizeStage(d.stage);
    if (!WON_STAGES.includes(stage)) continue;
    const hasValue = Number(d.value) > 0 && d.valueIsEstimate !== true;
    const prog = onboardingProgress(d, now);
    const issues = sanitizeIssues(d.issues);
    const open = issues.filter((i) => !i.resolvedAt);
    for (const i of issues) if (i.resolvedAt) resolveDays.push((toMs(i.resolvedAt) - toMs(i.openedAt)) / DAY);
    const wonAt = toMs(d.closedAt) || toMs(d.createdAt);
    const lastTouch = Math.max(toMs(d.lastTouchAt) || 0, prog.lastStepAt || 0, wonAt || 0) || null;
    const daysSinceTouch = lastTouch ? Math.max(0, Math.floor((now - lastTouch) / DAY)) : null;
    const oldestIssueDays = open.reduce((m, i) => Math.max(m, Math.floor((now - toMs(i.openedAt)) / DAY)), 0);
    const overdue = overdueByEmail.get(String(d.email).toLowerCase()) || null;

    const reasons = [];
    let health = 'healthy';
    const bump = (level) => { if (['healthy', 'onboarding', 'attention', 'at_risk'].indexOf(level) > ['healthy', 'onboarding', 'attention', 'at_risk'].indexOf(health)) health = level; };
    if (!prog.activated) {
      if ((prog.daysSinceWon ?? 0) >= ONBOARDING_STUCK_DAYS) { reasons.push(`Not activated ${prog.daysSinceWon} days after winning`); bump('attention'); }
      else { reasons.push('Onboarding in progress'); bump('onboarding'); }
    }
    if (open.length > 0) {
      reasons.push(`${open.length} open issue${open.length === 1 ? '' : 's'}${oldestIssueDays >= ISSUE_URGENT_DAYS ? ` (oldest ${oldestIssueDays} days)` : ''}`);
      bump(oldestIssueDays >= ISSUE_URGENT_DAYS ? 'at_risk' : 'attention');
    }
    if (overdue) { reasons.push(`Payment overdue (${overdue.count} invoice${overdue.count === 1 ? '' : 's'})`); bump('attention'); }
    if (daysSinceTouch !== null && daysSinceTouch >= AT_RISK_QUIET_DAYS) { reasons.push(`No contact for ${daysSinceTouch} days`); bump('at_risk'); }

    customers.push({
      email: d.email,
      businessName: d.businessName || '',
      stage,
      value: hasValue ? Number(d.value) : avg,
      estimated: !hasValue,
      wonAt,
      daysSinceWon: prog.daysSinceWon,
      onboarding: { done: prog.done, total: prog.total, pct: prog.pct, ids: [...prog.ids], activated: prog.activated, daysToActivate: prog.daysToActivate },
      lastTouch,
      daysSinceTouch,
      issues,
      openIssueCount: open.length,
      oldestIssueDays,
      overdue,
      health,
      reasons,
      checkin: suggestedCheckin(prog.daysSinceWon),
    });
  }

  const rank = { at_risk: 0, attention: 1, onboarding: 2, healthy: 3 };
  customers.sort((a, b) => rank[a.health] - rank[b.health] || b.value - a.value);

  const atRisk = customers.filter((c) => c.health === 'at_risk');
  const attention = customers.filter((c) => c.health === 'attention');
  const activated = customers.filter((c) => c.onboarding.activated);
  const toActivate = customers.filter((c) => c.onboarding.daysToActivate !== null).map((c) => c.onboarding.daysToActivate);
  const touched30 = customers.filter((c) => c.daysSinceTouch !== null && c.daysSinceTouch <= 30).length;

  return {
    customers,
    total: customers.length,
    totalValue: Math.round(sum(customers, (c) => c.value)),
    activated: activated.length,
    activationRate: customers.length ? activated.length / customers.length : null,
    avgDaysToActivate: toActivate.length ? Math.round(sum(toActivate, (x) => x) / toActivate.length) : null,
    onboardingCount: customers.filter((c) => !c.onboarding.activated).length,
    stuckOnboarding: customers.filter((c) => !c.onboarding.activated && (c.daysSinceWon ?? 0) >= ONBOARDING_STUCK_DAYS).length,
    atRisk: { count: atRisk.length, value: Math.round(sum(atRisk, (c) => c.value)) },
    attention: { count: attention.length, value: Math.round(sum(attention, (c) => c.value)) },
    touchedLast30: customers.length ? touched30 / customers.length : null,
    openIssues: sum(customers, (c) => c.openIssueCount),
    avgDaysToResolve: resolveDays.length ? Math.round((sum(resolveDays, (x) => x) / resolveDays.length) * 10) / 10 : null,
    steps: ONBOARDING_STEPS,
  };
}

/** Open (qualified-or-later) deals where nobody has answered a single qualification question yet. */
export function countQualificationGaps(deals = []) {
  const seen = new Set();
  let n = 0;
  for (const d of deals) {
    if (!d?.email) continue;
    const k = String(d.email).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    if (PIPELINE_STAGES.includes(normalizeStage(d.stage)) && qualificationSummary(d.qualification).answered === 0) n++;
  }
  return n;
}

export { openIssues };
