// Lead score negatives (Pass 150): bounced, unsubscribed or complained leads score 0; long silence lowers the score.
import assert from 'node:assert/strict';
import { LeadScoringEngine } from '../lib/lead-scoring-engine.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const engine = new LeadScoringEngine();
const now = Date.parse('2026-11-03T10:00:00Z');
const day = (d) => new Date(now - d * 86400000).toISOString();
const warm = { replied: true, seemsInterested: true, lastReplyAt: day(1), stage: 'qualified', industry: 'software', companySize: 'mid-market' };

t('a bounced, unsubscribed or complained lead scores zero, whatever else it did', () => {
  assert.ok(engine.calculateLeadScore(warm, { now }) > 0);
  assert.equal(engine.calculateLeadScore({ ...warm, bounced: true }, { now }), 0);
  assert.equal(engine.calculateLeadScore({ ...warm, status: 'unsubscribed' }, { now }), 0);
  assert.equal(engine.calculateLeadScore({ ...warm, complained: true }, { now }), 0);
});

t('a lead silent for 60 or 120 days loses points, so a cold lead no longer looks hot', () => {
  const fresh = engine.calculateLeadScore({ ...warm, lastReplyAt: day(1) }, { now });
  const quiet = engine.calculateLeadScore({ ...warm, lastReplyAt: day(70) }, { now });
  const cold = engine.calculateLeadScore({ ...warm, lastReplyAt: day(130) }, { now });
  assert.ok(quiet < fresh, 'silent 70 days scores below a fresh lead');
  assert.ok(cold < quiet, 'silent 130 days scores below 70 days');
});

t('the score stays between 0 and 100', () => {
  const s = engine.calculateLeadScore({ ...warm, lastReplyAt: day(500) }, { now });
  assert.ok(s >= 0 && s <= 100);
});

console.log(`\n${n} passed`);
