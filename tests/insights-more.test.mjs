// Insights, more (Pass 226): the spend audit and reactivation prompts use only the figures and notes given.
import assert from 'node:assert/strict';
import { spendAuditPrompt, reactivationPrompt } from '../lib/insights.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the spend audit prompt carries the synced figures and wins, and forbids invented numbers', () => {
  const p = spendAuditPrompt([{ month: '2026-10', source: 'meta', amount: 300 }], { meta: 2, google: 1 });
  assert.match(p.prompt, /2026-10 meta: 300/);
  assert.match(p.prompt, /meta: 2 won deals/);
  assert.match(p.system, /Never invent numbers/);
});

t('the reactivation prompt groups only the notes it is given, and never invents offers', () => {
  const p = reactivationPrompt(['Wanted a cheaper plan', 'Asked about delivery times']);
  assert.match(p.prompt, /Wanted a cheaper plan/);
  assert.match(p.system, /Never invent offers/);
});

console.log(`\n${n} passed`);
