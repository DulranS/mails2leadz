import assert from 'node:assert/strict';
import { safeHttpsUrl, parseProofPoints, parseObjections, sanitizeKit, kitLines, objectionBlock } from '../lib/sales-kit.js';
import { ANGLES, ANGLE_IDS, pickAngle, isAngleId, angleLabel } from '../lib/angles.js';
import { computeAngleStats } from '../lib/attribution.js';
import { computeOutboundPlan } from '../lib/plan.js';
import { referralState, computeCustomers } from '../lib/customers.js';
import { buildReferralLink, channelLabel, isReferralSrc } from '../lib/inbound.js';
import { computeBusinessMetrics } from '../lib/business-metrics.js';
import { buildDealWrite } from '../lib/deal-utils.js';
import { buildNextActions } from '../lib/next-actions.js';
import { POST_SALE_STAGES } from '../lib/default-templates.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000;
const now = Date.parse('2026-10-15T12:00:00Z');

t('booking link: https only, no scripts, no credentials, no spaces, no junk', () => {
  assert.equal(safeHttpsUrl('https://cal.com/ana/15min'), 'https://cal.com/ana/15min');
  for (const bad of ['http://cal.com/x', 'javascript:alert(1)', 'data:text/html,hi', 'https://user:pw@cal.com/x', 'https://cal.com/a b', 'https://localhost', 'cal.com/x', '', 'https://' + 'a'.repeat(300) + '.com']) assert.equal(safeHttpsUrl(bad), '', bad);
});

t('proof points: one per line, bullets stripped, short ones dropped, max 3; objections parsed, junk dropped, max 5', () => {
  assert.deepEqual(parseProofPoints('- Cut no-shows by a third for 12 cafes\n* Onboarded in a week\nok\n3) Third real point here\nFourth real point here'), ['Cut no-shows by a third for 12 cafes', 'Onboarded in a week', 'Third real point here']);
  const o = parseObjections('too expensive = we start with a small pilot\nalready have someone -> we complement them\nno separator here\nx = y\nbudget: ask me for a quote please');
  assert.deepEqual(o.map((x) => x.q), ['too expensive', 'already have someone', 'budget']);
  assert.equal(parseObjections(Array.from({ length: 9 }, (_, i) => `obj ${i} = a long enough answer ${i}`).join('\n')).length, 5);
});

t('kit is sanitised when read: bad link dropped, unknown lean angle dropped; prompt lines say "only these"', () => {
  const kit = sanitizeKit({ bookingLink: 'javascript:x', proofText: 'A real result for 12 cafes', objectionsText: 'price = pilot first please', leanAngle: 'nonsense' }, { validAngleIds: ANGLE_IDS });
  assert.equal(kit.bookingLink, ''); assert.equal(kit.leanAngle, '');
  const lines = kitLines({ ...kit, bookingLink: 'https://cal.com/x' }).join('\n');
  assert.ok(lines.includes('ONLY link') && lines.includes('ONLY results'));
  assert.ok(objectionBlock(kit).includes('price'));
  assert.equal(objectionBlock({ objections: [] }), '');
});

t('angles: stable per lead, spread evenly, lean angle gets ~60% and the rest keep rotating', () => {
  assert.equal(pickAngle({ uid: 'u', email: 'A@x.com' }), pickAngle({ uid: 'u', email: ' a@x.com ' }));
  const counts = Object.fromEntries(ANGLE_IDS.map((i) => [i, 0]));
  for (let i = 0; i < 3000; i++) counts[pickAngle({ uid: 'u1', email: `lead${i}@x.com` })]++;
  for (const id of ANGLE_IDS) assert.ok(counts[id] > 3000 / ANGLE_IDS.length * 0.7 && counts[id] < 3000 / ANGLE_IDS.length * 1.3, `${id}: ${counts[id]}`);
  const lean = Object.fromEntries(ANGLE_IDS.map((i) => [i, 0]));
  for (let i = 0; i < 3000; i++) lean[pickAngle({ uid: 'u1', email: `lead${i}@x.com`, leanAngle: 'question' })]++;
  assert.ok(lean.question / 3000 > 0.6 && lean.question / 3000 < 0.78, String(lean.question));
  assert.ok(ANGLE_IDS.filter((i) => i !== 'question').every((i) => lean[i] > 0));
  assert.ok(ANGLES.every((a) => a.brief.length > 30) && isAngleId('quick_win') && !isAngleId('x') && angleLabel('zzz') === 'Not recorded');
});

const emails = (angle, leads, replies, start = 0) => Array.from({ length: leads }, (_, i) => ({ to: `${angle}${start + i}@x.com`, angle, replied: i < replies, t: now - i * 1000 }));
t('angle stats: per lead, replies are the signal; a leader needs 2 comparable angles and an 8-point gap', () => {
  const s = computeAngleStats({ emails: [...emails('save_time', 20, 8), ...emails('question', 20, 3), ...emails('quick_win', 5, 4), { to: 'plain@x.com', replied: true, t: now }], labelOf: angleLabel });
  assert.deepEqual(s.rows.map((r) => r.angle), ['quick_win', 'save_time', 'question']); // sorted by reply rate
  assert.equal(s.rows.find((r) => r.angle === 'quick_win').enough, false);
  assert.deepEqual([s.verdict.leader, s.verdict.gapPoints], ['save_time', 25]); // 40% vs 15%; quick_win (5 leads) never counts
  assert.equal(computeAngleStats({ emails: [...emails('save_time', 20, 5), ...emails('question', 20, 4)] }).verdict, null); // 5 points: too close
  assert.equal(computeAngleStats({ emails: emails('save_time', 40, 20) }).verdict, null); // one angle only: nothing to compare
  assert.equal(computeAngleStats({ emails: [{ to: 'a@x.com', replied: true, t: 1 }] }).active, false);
});

const rows = (n, replied) => Array.from({ length: n }, (_, i) => ({ to: `l${i}@x.com`, replied: i < replied, t: now - (i % 28) * DAY }));
const deal = (email, stage, extra = {}) => ({ email, stage, value: 2000, estimated: false, reached: [stage], ...extra });
t('planner: refuses to plan on thin data and says what is missing', () => {
  const p = computeOutboundPlan({ emailRows: rows(20, 1), deals: [], goal: 0, now });
  assert.equal(p.ready, false);
  assert.ok(p.missing.length >= 4 && p.missing[0].includes('goal'));
});

t('planner: works backwards from the owner\'s own rates (wins -> conversations -> replies -> emails)', () => {
  const emailRows = rows(200, 20); // 10% reply
  const deals = [...Array.from({ length: 10 }, (_, i) => deal(`l${i}@x.com`, 'qualified')), ...Array.from({ length: 2 }, (_, i) => deal(`l${10 + i}@x.com`, 'closed_won', { reached: ['qualified', 'closed_won'] }))];
  // 12 qualified-or-later of 20 replies = 60%; 2 won of 12 = 16.7%; avg won 2000 (too few real wins -> default 2000)
  const p = computeOutboundPlan({ emailRows, deals, goal: 4000, avgDealValue: 2000, now });
  assert.equal(p.ready, true);
  assert.deepEqual(p.counts, { emailed: 200, replied: 20, qualified: 12, won: 2 });
  assert.equal(p.monthly.wins, 2); // 4000 / 2000
  assert.equal(p.monthly.qualified, 12); // 2 / (2/12)
  assert.equal(p.monthly.replies, 20); // 12 / 0.6
  assert.equal(p.monthly.sends, 200); // 20 / 0.1
  assert.equal(p.weekly.sends, Math.ceil(200 / 4.33));
  assert.equal(p.avgWonIsDefault, true);
  assert.ok(p.gapPerWeek === p.weekly.sends - p.sendsPerWeekNow);
});

t('referral: asked only when activated, 30+ days, healthy, nothing open/overdue, and not asked in 90 days', () => {
  const ok = { activated: true, daysSinceWon: 45, health: 'healthy', now };
  assert.equal(referralState(ok).eligible, true);
  for (const [patch, word] of [[{ activated: false }, 'activated'], [{ daysSinceWon: 10 }, 'soon'], [{ openIssues: 1 }, 'issue'], [{ overdue: true }, 'overdue'], [{ health: 'attention' }, 'doing well'], [{ askedAt: now - 20 * DAY }, 'ago']]) {
    const r = referralState({ ...ok, ...patch });
    assert.equal(r.eligible, false, word); assert.ok(r.why.toLowerCase().includes(word), `${word}: ${r.why}`);
  }
  assert.equal(referralState({ ...ok, askedAt: now - 100 * DAY }).eligible, true);
  const c = computeCustomers({ now, deals: [{ email: 'a@x.com', stage: 'closed_won', closedAt: new Date(now - 60 * DAY).toISOString(), createdAt: new Date(now - 80 * DAY).toISOString(), lastTouchAt: new Date(now - 5 * DAY).toISOString(), onboardingDone: { first_result: new Date(now - 50 * DAY).toISOString() } }] });
  assert.equal(typeof c.referralReady, 'number');
  assert.ok(c.customers[0].referral && 'eligible' in c.customers[0].referral);
});

t('referral deal write stamps referralAskedAt; "referral_ask" is a post-sale purpose (never a prospect follow-up)', () => {
  assert.ok(buildDealWrite({ uid: 'u', email: 'a@x.com', stage: 'closed_won', existing: { stage: 'closed_won' }, referralAsked: true }).referralAskedAt);
  assert.equal(buildDealWrite({ uid: 'u', email: 'a@x.com', stage: 'closed_won', existing: { stage: 'closed_won' } }).referralAskedAt, undefined);
  assert.ok(POST_SALE_STAGES.includes('referral_ask'));
});

t('referral link: built from the app origin + key, credits the customer, https only', () => {
  const key = 'u1.' + 'a'.repeat(48);
  const link = buildReferralLink({ origin: 'https://app.example.com/', key, customerName: 'Acme Cafe' });
  assert.equal(link, `https://app.example.com/enquire?k=${key}&src=ref-acme-cafe`);
  assert.equal(buildReferralLink({ origin: 'http://app.example.com', key, customerName: 'x' }), '');
  assert.equal(buildReferralLink({ origin: 'https://a.com', key: '', customerName: 'x' }), '');
  assert.equal(buildReferralLink({ origin: 'https://a.com/evil?x=', key, customerName: 'x' }), '');
  assert.ok(isReferralSrc('ref-acme') && !isReferralSrc('referral') && channelLabel('ref-acme-cafe') === 'Referral: Acme cafe');
});

const dl = (email, stage, extra = {}) => ({ email, stage, value: 1000, valueIsEstimate: false, createdAt: new Date(now - 72 * 3600000).toISOString(), lastUpdate: new Date(now - 3600000).toISOString(), reached: [stage], ...extra });
const at = (hoursAfterCreate) => ({ contacted: new Date(now - 72 * 3600000 + hoursAfterCreate * 3600000).toISOString() });
t('referral deals appear in the channel table and the waiting list; response time is median hours + share within the hour', () => {
  const m = computeBusinessMetrics({ now, outreach: { sent: 0, replied: 0 }, deals: [
    dl('a@x.com', 'closed_won', { source: 'referral', sourceDetail: 'ref-acme', value: 3000, reached: ['new', 'contacted', 'closed_won'] }),
    dl('b@x.com', 'new', { source: 'referral', sourceDetail: 'ref-acme' }),
    dl('c@x.com', 'new', { source: 'referral' }), // a manually tagged referral: not a form enquiry
    dl('d@x.com', 'contacted', { source: 'inbound', sourceDetail: 'instagram', stageTimes: at(0.5) }),
    dl('e@x.com', 'contacted', { source: 'inbound', sourceDetail: 'instagram', stageTimes: at(3) }),
    dl('f@x.com', 'contacted', { source: 'inbound', sourceDetail: 'qr', stageTimes: at(10) }),
  ] });
  const ref = m.past.inboundByChannel.find((r) => r.channel === 'ref-acme');
  assert.deepEqual([ref.label, ref.enquiries, ref.won, ref.revenue], ['Referral: Acme', 2, 1, 3000]);
  assert.ok(!m.past.inboundByChannel.some((r) => r.channel === '' && r.enquiries > 0 && r.label.startsWith('Referral')));
  assert.deepEqual(m.present.inboundWaiting.map((w) => w.email), ['b@x.com']);
  assert.deepEqual(m.past.inboundResponse, { answered: 3, medianHours: 3, withinHourPct: 33 });
  assert.deepEqual(computeBusinessMetrics({ now, outreach: { sent: 0, replied: 0 }, deals: [] }).past.inboundResponse, { answered: 0, medianHours: null, withinHourPct: null });
});

t('next actions: happy customers ready for a referral are suggested (info, after the urgent things)', () => {
  const m = computeBusinessMetrics({ now, outreach: { sent: 0, replied: 0 }, deals: [] });
  const a = buildNextActions({ metrics: m, customers: { atRisk: { count: 0 }, attention: { count: 0 }, referralReady: 2, stuckOnboarding: 0, openIssues: 0 } });
  const r = a.find((x) => x.id === 'referrals');
  assert.ok(r && r.title.startsWith('2 happy customers are ready') && r.priority === 3);
  assert.equal(buildNextActions({ metrics: m, customers: { atRisk: { count: 0 }, attention: { count: 0 }, referralReady: 0, stuckOnboarding: 0, openIssues: 0 } }).some((x) => x.id === 'referrals'), false);
});

console.log(`${n} sales-kit / learning-loop tests passed`);
