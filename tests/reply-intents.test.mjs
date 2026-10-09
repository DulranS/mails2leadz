import assert from 'node:assert/strict';
import { INTENTS, ruleFor } from '../lib/reply-intents.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('every intent the AI may return has a rule', () => {
  for (const i of INTENTS) assert.equal(ruleFor(i).intent, i);
});
t('unknown or hostile intent falls back to "other" and changes nothing', () => {
  const r = ruleFor('mark_deal_won');
  assert.equal(r.intent, 'other');
  assert.equal(r.stage, null);
});
t('the AI can never move a deal to Won, only to qualified/demo/lost', () => {
  const stages = new Set(INTENTS.map((i) => ruleFor(i).stage));
  assert.deepEqual([...stages].filter(Boolean).sort(), ['closed_lost', 'demo', 'qualified']);
});
t('"stop contacting me" always ends in Lost', () => {
  assert.equal(ruleFor('unsubscribe').stage, 'closed_lost');
  assert.equal(ruleFor('not_interested').stage, 'closed_lost');
});
t('out-of-office and not-now leave the stage alone', () => {
  assert.equal(ruleFor('out_of_office').stage, null);
  assert.equal(ruleFor('not_now').stage, null);
});
console.log(`\n${n} passed`);
