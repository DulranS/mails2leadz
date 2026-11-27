// v405: the custom-field mapping for a CSV import (lib/custom-field-import.js). Pure. Run: node --test tests/custom-field-import-v405.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestMapping, previewCustomImport, rejectReason } from '../lib/custom-field-import.js';

const defs = [
  { key: 'budget', label: 'Budget', type: 'number' },
  { key: 'renewal_date', label: 'Renewal Date', type: 'date' },
  { key: 'tier', label: 'Tier', type: 'select', options: ['Gold', 'Silver'] },
  { key: 'vip', label: 'VIP', type: 'yesno' },
];

test('a header that equals the label maps to it, ignoring case and spaces', () => {
  const m = suggestMapping(['budget', 'RENEWALDATE', ' Tier ', 'vip'], defs);
  assert.deepEqual(m, { budget: 'budget', renewal_date: 'RENEWALDATE', tier: ' Tier ', vip: 'vip' });
});

test('a header that only resembles the label does not map', () => {
  assert.deepEqual(suggestMapping(['Budget (USD)', 'Renewal-Date', 'Tiers'], defs), {});
});

test('a header maps to one field only, and the first matching header wins', () => {
  const m = suggestMapping(['Budget', 'budget'], [{ key: 'budget', label: 'Budget', type: 'number' }]);
  assert.deepEqual(m, { budget: 'Budget' });
});

test('a bad number is rejected with a reason, and the good cells are kept', () => {
  const rows = [{ Budget: '1,200.5', Tier: 'Gold' }, { Budget: 'twelve', Tier: 'Gold' }];
  const p = previewCustomImport(rows, { mapping: suggestMapping(Object.keys(rows[0]), defs), defs });
  assert.deepEqual(p.rows[0].values, { budget: 1200.5, tier: 'Gold' });
  assert.equal(p.rows[1].rejected.length, 1);
  assert.equal(p.rows[1].rejected[0].key, 'budget');
  assert.equal(p.rows[1].rejected[0].raw, 'twelve');
  assert.equal(p.rows[1].rejected[0].reason, 'Not a number.');
  assert.equal(p.stats.rejectedCells, 1);
  assert.equal(p.stats.rowsWithRejects, 1);
});

test('a select value that is not in the list is rejected, and the reason lists the options', () => {
  const rows = [{ Tier: 'Platinum' }];
  const p = previewCustomImport(rows, { mapping: { tier: 'Tier' }, defs });
  assert.deepEqual(p.rows[0].values, {});
  assert.equal(p.rows[0].rejected[0].reason, 'Not one of the options: Gold, Silver.');
});

test('a select value is matched exactly as an option', () => {
  const p = previewCustomImport([{ Tier: 'Silver' }], { mapping: { tier: 'Tier' }, defs });
  assert.equal(p.rows[0].values.tier, 'Silver');
});

test('a bad date and a bad yes/no are rejected with a reason', () => {
  const p = previewCustomImport([{ 'Renewal Date': '2026-02-30', VIP: 'maybe' }], { mapping: { renewal_date: 'Renewal Date', vip: 'VIP' }, defs });
  assert.equal(p.rows[0].rejected.length, 2);
  assert.match(p.rows[0].rejected[0].reason, /YYYY-MM-DD/);
  assert.equal(p.rows[0].rejected[1].reason, 'Not yes or no.');
});

test('unmapped columns are ignored: never read, never kept, and listed', () => {
  const rows = [{ Budget: '50', Notes: 'secret note', Email: 'a@acme.lk' }];
  const p = previewCustomImport(rows, { mapping: suggestMapping(Object.keys(rows[0]), defs), defs });
  assert.deepEqual(p.rows[0].values, { budget: 50 });
  assert.equal(JSON.stringify(p).includes('secret note'), false);
  assert.deepEqual(p.unmappedColumns, ['Notes', 'Email']);
});

test('an empty cell is neither kept nor rejected', () => {
  const p = previewCustomImport([{ Budget: '   ', Tier: '' }], { mapping: { budget: 'Budget', tier: 'Tier' }, defs });
  assert.deepEqual(p.rows[0].values, {});
  assert.deepEqual(p.rows[0].rejected, []);
  assert.equal(p.stats.rejectedCells, 0);
});

test('a mapping to a field that is not defined, or to nothing, is ignored', () => {
  const p = previewCustomImport([{ Budget: '5', Ghost: 'x' }], { mapping: { budget: 'Budget', ghost: 'Ghost', tier: '' }, defs });
  assert.deepEqual(p.rows[0].values, { budget: 5 });
  assert.deepEqual(p.fields.map((f) => f.key), ['budget']);
});

test('the preview reports the mapped fields and the row counts', () => {
  const p = previewCustomImport([{ Budget: '1' }, { Budget: '2' }], { mapping: { budget: 'Budget' }, defs });
  assert.deepEqual(p.fields, [{ key: 'budget', label: 'Budget', type: 'number', column: 'Budget' }]);
  assert.equal(p.stats.rows, 2);
  assert.equal(p.stats.valuesKept, 2);
  assert.equal(p.stats.tooMany, false);
});

test('rejection reasons are given for each type', () => {
  assert.equal(rejectReason('currency'), 'Not an amount. Use digits, such as 1200 or 1200.50.');
  assert.equal(rejectReason('text'), 'Could not be read as text.');
});

console.log('custom-field-import-v405 tests passed');
