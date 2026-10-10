import assert from 'node:assert/strict';
import { computeCustomers, suggestedCheckin, countQualificationGaps } from '../lib/customers.js';
import { qualificationSummary, setOnboardingStep, onboardingProgress, addIssue, setIssueResolved, openIssues, sanitizeIssues, sanitizeOnboardingDone } from '../lib/deal-extras.js';
import { buildDealWrite } from '../lib/deal-utils.js';
import { computeBusinessMetrics } from '../lib/business-metrics.js';
import { buildNextActions } from '../lib/next-actions.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 10, 12);
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
const won = (o) => ({ email: 'a@x.com', stage: 'closed_won', value: 2000, valueIsEstimate: false, createdAt: iso(60), closedAt: iso(10), lastUpdate: iso(10), ...o });

t('qualification: not assessed, weak on a no for budget or need, strong with 3 yes', () => {
  assert.equal(qualificationSummary(undefined).label, 'Not assessed');
  assert.equal(qualificationSummary({ budget: 'no', need: 'yes', authority: 'yes', timeline: 'yes' }).label, 'Weak');
  assert.equal(qualificationSummary({ budget: 'yes', need: 'yes', authority: 'yes' }).label, 'Strong');
  assert.equal(qualificationSummary({ budget: 'yes', timeline: 'no' }).label, 'Mixed');
  assert.equal(qualificationSummary({ budget: 'garbage' }).answered, 0); // junk values never count as answers
  assert.equal(qualificationSummary({ budget: 'yes', authority: 'no', need: 'yes', timeline: 'yes' }).complete, true);
});
t('onboarding steps tick, untick and ignore unknown steps', () => {
  let d = setOnboardingStep([], 'welcome', true, new Date(NOW));
  d = setOnboardingStep(d, 'first_value', true, new Date(NOW));
  assert.equal(d.length, 2);
  assert.equal(setOnboardingStep(d, 'welcome', true, new Date(NOW)).length, 2); // no duplicates
  assert.equal(setOnboardingStep(d, 'welcome', false).length, 1);
  assert.equal(setOnboardingStep(d, 'nonsense', true).length, 2);
  assert.equal(sanitizeOnboardingDone([{ id: 'x' }, { id: 'welcome' }, { id: 'welcome' }]).length, 1);
  const p = onboardingProgress({ onboardingDone: [{ id: 'first_value', at: iso(4) }], closedAt: iso(10) }, NOW);
  assert.equal(p.activated, true);
  assert.equal(p.daysToActivate, 6);
  assert.equal(p.done, 1);
});
t('issues: add, resolve, reopen, cap text, ignore junk', () => {
  let i = addIssue([], '  Invoice link\nbroken  ', new Date(NOW - 5 * DAY));
  assert.equal(i.length, 1);
  assert.equal(i[0].text, 'Invoice link broken');
  assert.equal(openIssues({ issues: i }).length, 1);
  i = setIssueResolved(i, i[0].id, true, new Date(NOW));
  assert.equal(openIssues({ issues: i }).length, 0);
  i = setIssueResolved(i, i[0].id, false);
  assert.equal(openIssues({ issues: i }).length, 1);
  assert.equal(addIssue(i, '   ').length, 1); // empty text is not an issue
  assert.equal(sanitizeIssues([{ text: 'x' }, null, 5]).length, 0);
});
t('deal write: stage times are recorded once and extras only when given', () => {
  const first = buildDealWrite({ uid: 'u', email: 'a@x.com', stage: 'qualified', now: new Date(NOW - 9 * DAY) });
  assert.ok(first.stageTimes.qualified);
  assert.equal(first.qualification, undefined);
  assert.equal(first.onboardingDone, undefined);
  const later = buildDealWrite({ uid: 'u', email: 'a@x.com', stage: 'qualified', existing: first, now: new Date(NOW) });
  assert.equal(later.stageTimes.qualified, first.stageTimes.qualified); // not overwritten
  const demo = buildDealWrite({ uid: 'u', email: 'a@x.com', stage: 'demo', existing: later, now: new Date(NOW) });
  assert.equal(Object.keys(demo.stageTimes).length, 2);
  const q = buildDealWrite({ uid: 'u', email: 'a@x.com', existing: demo, qualification: { budget: 'yes' }, touch: true, now: new Date(NOW) });
  assert.equal(q.qualification.budget, 'yes');
  assert.equal(q.qualification.need, 'unknown');
  assert.ok(q.lastTouchAt);
  assert.equal(q.stage, 'demo'); // changing extras never moves the deal
});
t('suggested check-in follows the customer lifecycle', () => {
  assert.equal(suggestedCheckin(0).purpose, 'onboarding');
  assert.equal(suggestedCheckin(10).purpose, 'delivery_check');
  assert.equal(suggestedCheckin(40).purpose, 'upsell_opportunity');
  assert.equal(suggestedCheckin(120).purpose, 'quarterly_review');
});
t('customers: only won stages, one row per email, health reasons are explicit', () => {
  const deals = [
    won({ email: 'new@x.com', closedAt: iso(2), createdAt: iso(20) }),                                   // onboarding
    won({ email: 'stuck@x.com', closedAt: iso(12) }),                                                    // not activated 12d
    won({ email: 'ok@x.com', closedAt: iso(30), onboardingDone: [{ id: 'first_value', at: iso(25) }], lastTouchAt: iso(5) }),
    won({ email: 'quiet@x.com', closedAt: iso(120), onboardingDone: [{ id: 'first_value', at: iso(100) }] }),   // no touch 120d
    won({ email: 'issue@x.com', closedAt: iso(30), onboardingDone: [{ id: 'first_value', at: iso(25) }], lastTouchAt: iso(2), issues: [{ id: 'i1', text: 'Broken', openedAt: iso(6), resolvedAt: null }] }),
    won({ email: 'pay@x.com', closedAt: iso(30), onboardingDone: [{ id: 'first_value', at: iso(25) }], lastTouchAt: iso(2) }),
    { email: 'open@x.com', stage: 'qualified', value: 1, createdAt: iso(3), lastUpdate: iso(3) },
    { email: 'lost@x.com', stage: 'closed_lost', value: 1, createdAt: iso(3), lastUpdate: iso(3) },
  ];
  const invoices = [{ email: 'pay@x.com', amount: 500, status: 'open', issuedAt: iso(40), dueAt: iso(10) }];
  const c = computeCustomers({ deals, invoices, now: NOW });
  assert.equal(c.total, 6);
  const by = Object.fromEntries(c.customers.map((x) => [x.email, x]));
  assert.equal(by['new@x.com'].health, 'onboarding');
  assert.equal(by['stuck@x.com'].health, 'attention');
  assert.equal(by['ok@x.com'].health, 'healthy');
  assert.equal(by['quiet@x.com'].health, 'at_risk');
  assert.match(by['quiet@x.com'].reasons.join(' '), /No contact for 100 days|No contact for 12\d days/);
  assert.equal(by['issue@x.com'].health, 'at_risk'); // issue open 6 days
  assert.equal(by['pay@x.com'].health, 'attention');
  assert.equal(by['pay@x.com'].overdue.count, 1);
  assert.equal(c.customers[0].health, 'at_risk'); // worst first
  assert.equal(c.atRisk.count, 2);
  assert.equal(c.openIssues, 1);
  assert.equal(c.activated, 4);
  assert.equal(c.stuckOnboarding, 1);
  assert.equal(c.avgDaysToActivate, 9); // (5+20+5+5)/4 = 8.75
});
t('estimated customer values are flagged, not trusted', () => {
  const c = computeCustomers({ deals: [won({ value: 0 })], avgDealValue: 750, now: NOW });
  assert.equal(c.customers[0].value, 750);
  assert.equal(c.customers[0].estimated, true);
});
t('qualification gaps count open deals with no answers, once per email', () => {
  const deals = [
    { email: 'a@x.com', stage: 'qualified' },
    { email: 'A@x.com', stage: 'qualified' },
    { email: 'b@x.com', stage: 'demo', qualification: { budget: 'yes' } },
    { email: 'c@x.com', stage: 'new' },
    { email: 'd@x.com', stage: 'proposal' },
  ];
  assert.equal(countQualificationGaps(deals), 2);
});
t('BDR comparison appears only when a BDR cost is entered, and needs the tool cost for a saving', () => {
  const deals = [won({ closedAt: iso(10), value: 9000 })];
  const none = computeBusinessMetrics({ deals, settings: { monthlyCost: 100 }, now: NOW });
  assert.equal(none.bdr, null);
  const m = computeBusinessMetrics({ deals, settings: { monthlyCost: 100, bdrMonthlyCost: 2000, bdrCommissionPct: 10 }, now: NOW });
  assert.equal(m.bdr.commissionMonthly, 300); // 9000 won in 90 days = 3000 a month, 10%
  assert.equal(m.bdr.bdrMonthly, 2300);
  assert.equal(m.bdr.savingMonthly, 2200);
  const noTool = computeBusinessMetrics({ deals, settings: { bdrMonthlyCost: 2000 }, now: NOW });
  assert.equal(noTool.bdr.savingMonthly, null);
});
t('next actions: overdue money first, then unbilled, at-risk customers, qualification', () => {
  const metrics = computeBusinessMetrics({ deals: [], now: NOW });
  const a = buildNextActions({
    metrics,
    billing: { overdue: { count: 2, amount: 1500, oldestDays: 12 } },
    unbilled: { count: 1, amount: 900, estimatedCount: 0 },
    customers: { atRisk: { count: 1, value: 2000 }, stuckOnboarding: 3 },
    qualGaps: 4,
  });
  assert.deepEqual(a.map((x) => x.id), ['overdue', 'unbilled', 'atrisk', 'qualification']);
  assert.equal(a[0].href, '/billing');
  assert.equal(buildNextActions({ metrics, customers: { atRisk: { count: 0, value: 0 }, stuckOnboarding: 2 } }).some((x) => x.id === 'onboarding'), true);
});
console.log(`\n${n} passed`);
