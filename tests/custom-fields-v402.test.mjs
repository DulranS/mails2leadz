// v402: choice-from-a-list and money-amount custom fields. Pure. Run: node --test tests/custom-fields-v402.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDefinitions, sanitizeValue, sanitizeCustomValues, sanitizeFilter, matchesFilter, cleanOptions, FILTER_OPS, SELECT_OPTIONS } from '../lib/custom-fields.js';

test('a choice field needs two to twenty options; blanks and repeats are dropped', () => {
  const [ok] = sanitizeDefinitions([{ label: 'Tier', type: 'select', options: ['Gold', ' Silver ', 'Gold', '', 'Bronze'] }]);
  assert.deepEqual(ok.options, ['Gold', 'Silver', 'Bronze']);
  assert.equal(sanitizeDefinitions([{ label: 'Tier', type: 'select', options: ['Only one'] }]).length, 0, 'one option is dropped');
  assert.equal(sanitizeDefinitions([{ label: 'Tier', type: 'select', options: [] }]).length, 0, 'no options is dropped');
  const many = Array.from({ length: 30 }, (_, i) => `Option ${i}`);
  assert.equal(sanitizeDefinitions([{ label: 'Tier', type: 'select', options: many }])[0].options.length, SELECT_OPTIONS.max);
  assert.equal(cleanOptions('a, b,c').length, 3, 'comma-separated text is accepted');
});

test('a money field keeps two decimals and accepts commas', () => {
  const [def] = sanitizeDefinitions([{ label: 'Deal size', type: 'currency' }]);
  assert.equal(def.type, 'currency');
  assert.equal(sanitizeValue('currency', '1,234.567'), 1234.57);
  assert.equal(sanitizeValue('currency', 'abc'), null);
});

test('a choice value must be one of the owner’s options', () => {
  const opts = ['Gold', 'Silver'];
  assert.equal(sanitizeValue('select', 'Gold', opts), 'Gold');
  assert.equal(sanitizeValue('select', 'Platinum', opts), null, 'not in the list');
  assert.equal(sanitizeValue('select', 'gold', opts), null, 'matching is exact');
});

test('saved values keep only defined choices and money amounts', () => {
  const defs = [
    { key: 'tier', label: 'Tier', type: 'select', options: ['Gold', 'Silver'] },
    { key: 'spend', label: 'Spend', type: 'currency' },
  ];
  const out = sanitizeCustomValues({ tier: 'Gold', spend: '950.5', extra: 'x' }, defs);
  assert.deepEqual(out, { tier: 'Gold', spend: 950.5 });
  assert.deepEqual(sanitizeCustomValues({ tier: 'Bronze' }, defs), {});
});

test('a choice filter must name one of the options', () => {
  const defs = [{ key: 'tier', label: 'Tier', type: 'select', options: ['Gold', 'Silver'] }];
  assert.deepEqual(sanitizeFilter({ key: 'tier', op: 'equals', value: 'Silver' }, defs), { key: 'tier', type: 'select', op: 'equals', value: 'Silver' });
  assert.equal(sanitizeFilter({ key: 'tier', op: 'equals', value: 'Bronze' }, defs), null);
  assert.equal(sanitizeFilter({ key: 'tier', op: 'atLeast', value: 'Gold' }, defs), null, 'only equals applies to a choice');
});

test('a choice filter matches exactly; a money filter compares numbers', () => {
  const tier = { key: 'tier', type: 'select', op: 'equals', value: 'Gold' };
  assert.equal(matchesFilter(tier, 'Gold'), true);
  assert.equal(matchesFilter(tier, 'Silver'), false);
  assert.equal(matchesFilter(tier, null), false, 'an unset value never passes');
  const spend = { key: 'spend', type: 'currency', op: 'atLeast', value: 500 };
  assert.equal(matchesFilter(spend, 1000), true);
  assert.equal(matchesFilter(spend, 499.99), false);
  assert.deepEqual(FILTER_OPS.currency, ['atLeast', 'atMost']);
  assert.deepEqual(FILTER_OPS.select, ['equals']);
});
