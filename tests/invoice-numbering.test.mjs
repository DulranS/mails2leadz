import assert from 'node:assert/strict';
import { formatInvoiceNumber, maxExistingNumber, nextNumberValue, normalizePrefix } from '../lib/invoice-numbering.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a number is the prefix and a four-digit padded count', () => {
  assert.equal(formatInvoiceNumber('INV-', 42), 'INV-0042');
  assert.equal(formatInvoiceNumber('KD/', 12345), 'KD/12345');
  assert.equal(normalizePrefix(undefined), 'INV-');
  assert.equal(normalizePrefix('  '), 'INV-');
});

t('the highest number already used with this prefix is found; other prefixes and typed text are ignored', () => {
  assert.equal(maxExistingNumber(['INV-0007', 'INV-0042', 'XX-0999', 'INV-abc', '', null, 'INV-0003'], 'INV-'), 42);
  assert.equal(maxExistingNumber([], 'INV-'), 0);
});

t('the next number never repeats one already used, even when the counter is behind', () => {
  assert.equal(nextNumberValue({ counterNext: 0, maxExisting: 0 }), 1);
  assert.equal(nextNumberValue({ counterNext: 5, maxExisting: 42 }), 43);
  assert.equal(nextNumberValue({ counterNext: 50, maxExisting: 42 }), 50);
});

console.log(`invoice-numbering: ${n} passed`);
