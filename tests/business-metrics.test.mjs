import assert from 'node:assert/strict';
import { computeBusinessMetrics } from '../lib/business-metrics.js';
import { dealDocId, normalizeStage, buildDealWrite } from '../lib/deal-utils.js';

const now = Date.parse('2026-10-05T12:00:00Z');
const d = (days) => new Date(now - days * 86400000).toISOString();
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('deal ids are per-tenant and case-insensitive', () => {
  assert.equal(dealDocId('u1', ' A@X.com '), 'u1_a@x.com');
  assert.notEqual(dealDocId('u1', 'a@x.com'), dealDocId('u2', 'a@x.com'));
});
t('legacy stage names normalise', () => {
  assert.equal(normalizeStage('won'), 'closed_won');
  assert.equal(normalizeStage('engaged'), 'contacted');
  assert.equal(normalizeStage('???'), 'new');
});
t('closedAt only set on the transition to closed; cleared on re-open', () => {
  const w1 = buildDealWrite({ uid: 'u', email: 'a@x.com', stage: 'won', existing: { stage: 'proposal' }, now: new Date(now) });
  assert.ok(w1.closedAt);
  const w2 = buildDealWrite({ uid: 'u', email: 'a@x.com', stage: 'closed_won', existing: { stage: 'closed_won' }, now: new Date(now) });
  assert.equal('closedAt' in w2, false);
  const w3 = buildDealWrite({ uid: 'u', email: 'a@x.com', stage: 'demo', existing: { stage: 'closed_won' }, now: new Date(now) });
  assert.equal(w3.closedAt, null);
});
t('stage change without a value never overwrites an existing value', () => {
  const w = buildDealWrite({ uid: 'u', email: 'a@x.com', stage: 'demo', existing: { stage: 'qualified', value: 7000 }, now: new Date(now) });
  assert.equal('value' in w, false);
});

const deals = [
  { email: 'w1@x.com', stage: 'closed_won', value: 3000, createdAt: d(50), closedAt: d(20), lastUpdate: d(20) },
  { email: 'w2@x.com', stage: 'won', value: 1000, createdAt: d(80), closedAt: d(40), lastUpdate: d(40) },
  { email: 'l1@x.com', stage: 'closed_lost', value: 2000, createdAt: d(60), closedAt: d(30), lastUpdate: d(30) },
  { email: 'o1@x.com', stage: 'proposal', value: 4000, createdAt: d(10), lastUpdate: d(2) },
  { email: 'o2@x.com', stage: 'demo', value: 2000, createdAt: d(30), lastUpdate: d(20) },   // stale
  { email: 'o3@x.com', stage: 'qualified', createdAt: d(5), lastUpdate: d(1) },               // no value -> default
  { email: 'o3@x.com', stage: 'qualified', createdAt: d(5), lastUpdate: d(1) },               // duplicate row
];
const m = computeBusinessMetrics({ deals, outreach: { sent: 100, replied: 12 }, settings: { avgDealValue: 1500, monthlyCost: 100 }, aiCostUsd: 3, now });

t('past: revenue, win rate, cycle', () => {
  assert.equal(m.past.wonRevenue, 4000);
  assert.equal(m.past.winRate, 2 / 3);
  assert.equal(m.past.avgWonValue, 2000);
  assert.equal(m.past.avgCycleDays, Math.round((30 + 40) / 2));
  assert.equal(m.past.wonByMonth.length, 6);
  assert.equal(m.past.wonByMonth.reduce((a, x) => a + x.revenue, 0), 4000);
});
t('present: dedupes by email, uses default value, weights by stage', () => {
  assert.equal(m.present.openCount, 3);
  assert.equal(m.present.openValue, 4000 + 2000 + 1500);
  assert.equal(m.present.weightedPipeline, 4000 * 0.6 + 2000 * 0.4 + 1500 * 0.25);
  assert.equal(m.present.staleCount, 1);
  assert.equal(m.present.staleValue, 2000);
});
t('present: funnel is built from real counts, monotonic and capped', () => {
  const f = Object.fromEntries(m.present.funnel.map((s) => [s.key, s.count]));
  assert.deepEqual(f, { sent: 100, replied: 12, qualified: 5, demo: 4, proposal: 3, won: 2 });
  assert.ok(m.present.funnel.every((s) => s.fromPrevious === null || (s.fromPrevious >= 0 && s.fromPrevious <= 1)));
});
t('future: horizons grow, never exceed weighted pipeline, range brackets expected', () => {
  const [h30, h60, h90] = m.future.horizons;
  assert.ok(h30.expected <= h60.expected && h60.expected <= h90.expected);
  assert.ok(h90.expected <= m.present.weightedPipeline);
  assert.ok(h30.low <= h30.expected && h30.expected <= h30.high);
  assert.equal(m.future.confidence, 'low'); // 3 closed deals
});
t('roi: cost = 3 months tool + AI spend; multiple computed on 90d revenue', () => {
  assert.equal(m.roi.cost, 303);
  assert.equal(m.roi.revenue, 4000);
  assert.equal(m.roi.multiple, 13.2);
  assert.equal(m.roi.costPerWin, Math.round(303 / 2));
});
t('post-sale stages count as won revenue once and never as open pipeline', () => {
  const x = computeBusinessMetrics({ deals: [
    { email: 'a@x.com', stage: 'retention', value: 5000, createdAt: d(90), closedAt: d(10), lastUpdate: d(1) },
    { email: 'b@x.com', stage: 'negotiation', value: 1000, createdAt: d(5), lastUpdate: d(1) },
  ], now });
  assert.equal(x.past.wonRevenue, 5000);
  assert.equal(x.present.openCount, 1);
  assert.equal(x.present.stages.find((s) => s.stage === 'negotiation').weighted, 750);
  // moving delivery -> retention must not reset closedAt
  const w = buildDealWrite({ uid: 'u', email: 'a@x.com', stage: 'retention', existing: { stage: 'delivery' }, now: new Date(now) });
  assert.equal('closedAt' in w, false);
});
t('cold contacts are prospects: never counted as pipeline value or forecast', () => {
  const many = Array.from({ length: 300 }, (_, i) => ({ email: `c${i}@x.com`, stage: i % 2 ? 'contacted' : 'new', createdAt: d(3), lastUpdate: d(30) }));
  const x = computeBusinessMetrics({ deals: [...many, { email: 'real@x.com', stage: 'qualified', value: 2000, createdAt: d(3), lastUpdate: d(1) }], settings: { avgDealValue: 5000 }, now });
  assert.equal(x.present.prospectCount, 300);
  assert.equal(x.present.openCount, 1);
  assert.equal(x.present.openValue, 2000);
  assert.equal(x.present.staleCount, 0);          // untouched prospects are not "at risk revenue"
  assert.ok(x.future.horizons[2].expected <= 500); // 25% of $2000 at most
});
t('empty account does not crash or divide by zero', () => {
  const e = computeBusinessMetrics({});
  assert.equal(e.past.winRate, null);
  assert.equal(e.roi.multiple, null);
  assert.equal(e.future.horizons[0].expected, 0);
  assert.ok(e.notes.length >= 1);
});
console.log(`\n${n} passed`);

// ---------- next actions ----------
const { buildNextActions } = await import('../lib/next-actions.js');
const mm = computeBusinessMetrics({ deals: [
  { email: 'q@x.com', stage: 'qualified', createdAt: d(30), lastUpdate: d(20) },
  { email: 'w@x.com', stage: 'closed_won', value: 1000, createdAt: d(10), closedAt: d(2), lastUpdate: d(2) },
], settings: { avgDealValue: 2000 }, outreach: { sent: 50, replied: 5 }, now });
t('next actions: replies without a deal come first, with money attached', () => {
  const a = buildNextActions({ metrics: mm, unconvertedReplies: [{ email: 'a@x.com', business: 'Acme' }, { email: 'b@x.com' }], dueFollowUps: 3, monthlyGoal: 5000, sentRecently: 50 });
  assert.equal(a[0].id, 'replies');
  assert.match(a[0].detail, /\$1,000/);           // 2 replies × $2000 × 25%
  assert.ok(a.some((x) => x.id === 'followups') && a.some((x) => x.id === 'stale') && a.some((x) => x.id === 'goal'));
  assert.ok(a.length <= 5);
});
t('next actions: quiet when everything is healthy', () => {
  const healthy = computeBusinessMetrics({ deals: [{ email: 'q@x.com', stage: 'demo', value: 3000, createdAt: d(5), lastUpdate: d(1) }], now });
  assert.deepEqual(buildNextActions({ metrics: healthy, sentRecently: 10 }), []);
});
t('next actions: missing profile is flagged; goal already covered adds nothing', () => {
  const a = buildNextActions({ metrics: mm, hasProfile: false, monthlyGoal: 900 });
  assert.equal(a[0].id, 'profile');
  assert.ok(!a.some((x) => x.id === 'goal'));
});
console.log('\nnext-actions ok');

// ---------- 90-day cost windows + estimated won deals ----------
const old = computeBusinessMetrics({ deals: [
  { email: 'old@x.com', stage: 'closed_won', value: 9000, createdAt: d(400), closedAt: d(300), lastUpdate: d(300) },
  { email: 'new@x.com', stage: 'closed_won', createdAt: d(20), closedAt: d(5), lastUpdate: d(5) }, // no real value
], settings: { avgDealValue: 1000, monthlyCost: 100 }, aiCostUsd: 3, outreach: { sent: 20, replied: 4 }, now });
t('cost per win divides 90-day cost by 90-day wins (not all-time wins)', () => {
  assert.equal(old.roi.wonCount, 1);
  assert.equal(old.roi.costPerWin, 303); // (100*3 + 3) / 1 win in the window, not / 2 all-time
});
t('won deals on the default value are flagged and raise a "set real value" action', () => {
  assert.equal(old.past.estimatedWonCount, 1);
  assert.ok(old.notes.some((x) => /won deal/.test(x)));
  assert.ok(buildNextActions({ metrics: old, sentRecently: 10 }).some((x) => x.id === 'values'));
});
console.log('\nwindows ok');

// ---------- lost reasons ----------
const lr = computeBusinessMetrics({ deals: [
  { email: 'a@x.com', stage: 'closed_lost', value: 3000, lostReason: 'price', createdAt: d(30), closedAt: d(3), lastUpdate: d(3) },
  { email: 'b@x.com', stage: 'closed_lost', value: 1000, lostReason: 'price', createdAt: d(30), closedAt: d(3), lastUpdate: d(3) },
  { email: 'c@x.com', stage: 'closed_lost', value: 500, lostReason: 'timing', createdAt: d(30), closedAt: d(3), lastUpdate: d(3) },
  { email: 'd@x.com', stage: 'closed_lost', value: 800, createdAt: d(30), closedAt: d(3), lastUpdate: d(3) }, // no reason
  { email: 'e@x.com', stage: 'closed_lost', value: 900, lostReason: 'unsubscribed', createdAt: d(30), closedAt: d(3), lastUpdate: d(3) }, // opt-out: not a lost sale
], now });
t('lost reasons: grouped by money lost, unrecorded kept, opt-outs excluded', () => {
  assert.equal(lr.past.lostCount, 4);
  assert.deepEqual(lr.past.lostReasons.map((r) => [r.reason, r.count, r.value]), [['price', 2, 4000], ['unrecorded', 1, 800], ['timing', 1, 500]]);
  assert.equal(lr.past.lostReasons[0].label, 'Price / budget');
});
t('lost reason is stored only when Lost, from the list, never over a system reason; cleared on reopen', () => {
  const lost = buildDealWrite({ uid: 'u', email: 'a@x.com', stage: 'closed_lost', lostReason: 'price', existing: { stage: 'qualified' } });
  assert.equal(lost.lostReason, 'price');
  assert.equal(buildDealWrite({ uid: 'u', email: 'a@x.com', stage: 'closed_lost', lostReason: 'made-up', existing: { stage: 'qualified' } }).lostReason, undefined);
  assert.equal(buildDealWrite({ uid: 'u', email: 'a@x.com', stage: 'closed_lost', lostReason: 'price', existing: { stage: 'closed_lost', lostReason: 'unsubscribed' } }).lostReason, undefined);
  assert.equal(buildDealWrite({ uid: 'u', email: 'a@x.com', stage: 'qualified', existing: { stage: 'closed_lost', lostReason: 'price' } }).lostReason, null);
  assert.equal(buildDealWrite({ uid: 'u', email: 'a@x.com', stage: 'qualified', existing: { stage: 'closed_lost', lostReason: 'unsubscribed' } }).lostReason, undefined);
});
console.log('\nlost reasons ok');
