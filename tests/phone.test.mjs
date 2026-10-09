import assert from 'node:assert/strict';
import { normalizePhone } from '../lib/phone.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('local numbers get the default country code', () => {
  assert.equal(normalizePhone('077 123 4567', '94'), '94771234567');
  assert.equal(normalizePhone('0771234567', '44'), '44771234567');
  assert.equal(normalizePhone('0771234567', '1'), '1771234567');
});
t('numbers with a country code are never changed', () => {
  assert.equal(normalizePhone('+44 7911 123456', '94'), '447911123456');
  assert.equal(normalizePhone('0044 7911 123456', '94'), '447911123456');
  assert.equal(normalizePhone('+1 (415) 555-0199', '94'), '14155550199');
});
t('Sri Lankan 9-digit mobiles without the 0 still work, only for +94', () => {
  assert.equal(normalizePhone('771234567', '94'), '94771234567');
  assert.equal(normalizePhone('771234567', '44'), null);
});
t('junk is rejected', () => {
  for (const v of [null, undefined, '', 'N/A', 'null', '123', 'abc']) assert.equal(normalizePhone(v, '94'), null);
});
console.log(`\n${n} passed`);
