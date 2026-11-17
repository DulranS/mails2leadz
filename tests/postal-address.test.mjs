// Postal address and opt-out gate (v327 close-out): a bulk send needs an address that looks real and a working opt-out link.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { postalAddressProblem } from '../lib/server/unsubscribe.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('an empty address is refused with the setting to fix', () => {
  assert.match(postalAddressProblem(''), /Account > Your business/);
  assert.match(postalAddressProblem('   '), /Account > Your business/);
});
t('a too-short address is refused', () => {
  assert.match(postalAddressProblem('12 Main'), /too short/);
});
t('an address with no number is refused', () => {
  assert.match(postalAddressProblem('Galle Road, Colombo'), /no building or street number/);
});
t('a normal address passes', () => {
  assert.equal(postalAddressProblem('24 Galle Road, Colombo 03, Sri Lanka'), null);
});
t('the send route holds bulk email when the opt-out link cannot be built', () => {
  const src = fs.readFileSync('app/api/send-email/route.js', 'utf8');
  assert.match(src, /postalAddressProblem\(senderAddress\)/);
  assert.match(src, /optOutFor\(userId, 'probe@example.com', senderAddress\)/);
  assert.match(src, /status: 503/);
});
console.log(`  ${n} postal address checks passed`);
