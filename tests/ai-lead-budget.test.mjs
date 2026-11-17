// Per-lead AI meter and cap (pass 329): the pure rule, plus a check that every lead-linked AI call passes its lead.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { leadKeyFor, leadBudgetState, DEFAULT_LEAD_BUDGET_USD } from '../lib/ai-lead-budget.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the same email in any case or spacing is the same lead', () => {
  assert.equal(leadKeyFor('  Ana@Example.com '), leadKeyFor('ana@example.com'));
});
t('different leads get different keys', () => {
  assert.notEqual(leadKeyFor('a@x.com'), leadKeyFor('b@x.com'));
});
t('the key hides the address and has a fixed length', () => {
  const k = leadKeyFor('private.person@example.com');
  assert.equal(k.length, 32);
  assert.ok(!k.includes('@') && !k.includes('example'));
});
t('no email gives no key, so nothing is metered', () => {
  assert.equal(leadKeyFor(''), null);
  assert.equal(leadKeyFor(undefined), null);
});
t('a lead at or over the budget is stopped; under it, it is allowed', () => {
  assert.equal(leadBudgetState({ costUsd: 0.5, budgetUsd: 0.5 }).over, true);
  assert.equal(leadBudgetState({ costUsd: 0.49, budgetUsd: 0.5 }).over, false);
  assert.ok(Math.abs(leadBudgetState({ costUsd: 0.49, budgetUsd: 0.5 }).remaining - 0.01) < 1e-9);
});
t('a missing or zero budget uses the default', () => {
  assert.equal(leadBudgetState({ costUsd: 0, budgetUsd: 0 }).cap, DEFAULT_LEAD_BUDGET_USD);
  assert.equal(leadBudgetState({ costUsd: 0 }).cap, DEFAULT_LEAD_BUDGET_USD);
});

// Every lead-linked AI call must pass its lead, or its spend is not metered against that lead.
const LEAD_CALLS = [
  'lib/server/draft-core.js', 'lib/server/battle-card.js', 'lib/server/relationship-asks.js', 'lib/server/reply-triage.js',
  'app/api/ai-deal-draft/route.js', 'app/api/ai-followup/route.js', 'app/api/calls/summarise/route.js',
];
t('each lead-linked AI call passes leadEmail', () => {
  for (const f of LEAD_CALLS) {
    const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.match(src, /leadEmail:/, f);
  }
});
t('the usage meter and cap are wired into callAI, and the stats route exists', () => {
  const src = fs.readFileSync(new URL('../lib/ai-client.js', import.meta.url), 'utf8');
  assert.match(src, /readLeadCost\(db, uid, leadKey\)/);
  assert.match(src, /'AI_LEAD_BUDGET', 429/);
  assert.match(src, /ai_lead_usage/);
  assert.ok(fs.existsSync(new URL('../app/api/ai-cost-per-lead/route.js', import.meta.url)));
});

t('the AI figure is on the KPI screen, and each enriched record counts its paid lookups', () => {
  const k = fs.readFileSync(new URL('../app/api/kpis/route.js', import.meta.url), 'utf8');
  const b = fs.readFileSync(new URL('../app/components/BusinessSalesSummary.js', import.meta.url), 'utf8');
  const e = fs.readFileSync(new URL('../lib/server/enrich-deals.js', import.meta.url), 'utf8');
  assert.match(k, /aiCostPerLead\(db, who\.uid\)/);
  assert.match(b, /AI cost per lead/);
  assert.match(e, /vendorCalls/);
});

console.log(`  ${n} per-lead AI budget checks passed`);
