// Stage aging (a deal flagged once it sits too long in its stage) and the buying committee (champion and economic buyer mapped).
import assert from 'node:assert/strict';
import { dealHealth, STAGE_AGING_DAYS } from '../lib/health.js';
import { sanitizeCommittee, committeeGaps, sanitizeQualification, COMMITTEE_MAX, COMMITTEE_ROLES } from '../lib/deal-extras.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000;
const NOW = Date.parse('2026-11-23T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * DAY).toISOString();
const deal = (stage, enteredDaysAgo, extra = {}) => ({
  stage, value: 1000, nextStep: 'call', updatedAt: daysAgo(0), stageTimes: { [stage]: daysAgo(enteredDaysAgo) }, ...extra,
});

t('a proposal sitting 15 days (limit 14) is flagged for aging', () => {
  const h = dealHealth(deal('proposal', 15), NOW);
  assert.ok(h.risks.some((r) => r.includes('15 days in proposal') && r.includes('limit 14')), h.risks.join(' | '));
});

t('a negotiation at 15 days is not flagged (its limit is 21)', () => {
  const h = dealHealth(deal('negotiation', 15), NOW);
  assert.ok(!h.risks.some((r) => r.includes('days in negotiation')), h.risks.join(' | '));
});

t('a new lead at 8 days is flagged (limit 7); the limits exist for every open stage', () => {
  const h = dealHealth(deal('new', 8), NOW);
  assert.ok(h.risks.some((r) => r.includes('8 days in new')));
  for (const s of ['new', 'contacted', 'qualified', 'demo', 'proposal', 'negotiation']) assert.ok(STAGE_AGING_DAYS[s] > 0, s);
});

t('a deal that entered its stage today has no aging risk and stays healthy', () => {
  const h = dealHealth(deal('demo', 0), NOW);
  assert.equal(h.status, 'healthy');
});

t('a closed deal has no health record (no aging check)', () => {
  assert.equal(dealHealth({ ...deal('demo', 30), stage: 'closed_won' }, NOW), null);
});

t('committee: an unknown role becomes "other", names are clipped, and the list is capped', () => {
  const list = Array.from({ length: 12 }, (_, i) => ({ name: `P${i}`, role: 'boss' }));
  const out = sanitizeCommittee(list);
  assert.equal(out.length, COMMITTEE_MAX);
  assert.ok(out.every((m) => m.role === 'other'));
  assert.equal(sanitizeCommittee([{ name: 'x'.repeat(200), role: 'champion' }])[0].name.length, 80);
});

t('committee: a blank row is kept, so an "Add a person" row survives the next save', () => {
  const out = sanitizeCommittee([{ name: '', role: 'other' }, { name: 'Ana', role: 'champion' }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, '');
});

t('committee gaps: champion and economic buyer are reported until someone with each role is named', () => {
  assert.equal(committeeGaps([]).length, 2);
  assert.deepEqual(committeeGaps([{ name: 'Ana', role: 'champion' }]), [COMMITTEE_ROLES.find((r) => r.id === 'economic_buyer').label]);
  assert.equal(committeeGaps([{ name: 'Ana', role: 'champion' }, { name: 'Ravi', role: 'economic_buyer' }]).length, 0);
});

t('committee gaps ignore blank rows (an empty "Add a person" row does not count as mapped)', () => {
  assert.equal(committeeGaps([{ name: '', role: 'champion' }, { name: '', role: 'economic_buyer' }]).length, 2);
});

t('qualification keeps the committee alongside the four answers', () => {
  const q = sanitizeQualification({ budget: 'yes', committee: [{ name: 'Ana', role: 'champion' }] });
  assert.equal(q.budget, 'yes');
  assert.equal(q.authority, 'unknown');
  assert.deepEqual(q.committee, [{ name: 'Ana', role: 'champion' }]);
});

console.log(`stage-aging-committee: ${n} passed`);
