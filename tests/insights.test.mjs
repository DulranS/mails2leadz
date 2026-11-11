// Insights (Pass 226): synced spend by platform for a month; rep record over the year; proof usable only with written consent; critique and pattern prompts use only the owner's words.
import assert from 'node:assert/strict';
import { spendFromMarketing, repScorecard, parseProof, approvedProof, critiquePrompt, patternsPrompt } from '../lib/insights.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000, now = Date.parse('2026-11-06T12:00:00Z');

t('synced spend is read per platform for one month; other months and unknown sources are ignored', () => {
  const s = spendFromMarketing([
    { month: '2026-10', source: 'meta', amount: 300 },
    { month: '2026-10', source: 'google', amount: 150.5 },
    { month: '2026-09', source: 'meta', amount: 999 },
    { month: '2026-10', source: 'paper', amount: 5 },
  ], '2026-10');
  assert.deepEqual(s, { meta: 300, google: 150.5 });
});

t('a rep\'s record over the year shows wins, losses, win rate and won value; no owner is shown as unassigned', () => {
  const deals = [
    { stage: 'closed_won', ownerId: 'ann', value: 900, stageTimes: { closed_won: new Date(now - 10 * DAY).toISOString() } },
    { stage: 'closed_lost', ownerId: 'ann', stageTimes: { closed_lost: new Date(now - 20 * DAY).toISOString() } },
    { stage: 'closed_won', value: 100, stageTimes: { closed_won: new Date(now - 30 * DAY).toISOString() } },
    { stage: 'closed_won', ownerId: 'ann', value: 9, stageTimes: { closed_won: new Date(now - 400 * DAY).toISOString() } },
  ];
  const r = repScorecard(deals, now);
  const ann = r.find((x) => x.owner === 'ann');
  assert.equal(ann.won, 1);
  assert.equal(ann.lost, 1);
  assert.equal(ann.winRatePct, 50);
  assert.equal(ann.wonValue, 900);
  assert.equal(r.find((x) => x.owner === 'unassigned').won, 1);
});

t('a testimonial is usable only when the owner recorded written consent', () => {
  const entries = parseProof('"They fixed our booking problem in a week." | Ann Clinic | yes\n"Good service overall, quick replies." | Bo Ltd | no\nshort');
  assert.equal(entries.length, 2);
  assert.equal(approvedProof(entries).length, 1);
  assert.equal(approvedProof(entries)[0].customer, 'Ann Clinic');
});

t('the critique and pattern prompts carry only the owner\'s own standard and notes', () => {
  const c = critiquePrompt('Warm, brief.', 'Hi there, buy now!!!');
  assert.match(c.prompt, /Warm, brief\./);
  assert.match(c.prompt, /buy now/);
  assert.match(c.system, /Never invent/);
  const p = patternsPrompt(['Asked about pricing first'], ['Went quiet after the quote']);
  assert.match(p.prompt, /Asked about pricing first/);
  assert.match(p.system, /Never invent/);
});

console.log(`\n${n} passed`);
