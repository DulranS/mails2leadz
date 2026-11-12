// App-keys owner (Pass 234): the first person to sign in owns app keys; later sign-ins cannot take it.
import assert from 'node:assert/strict';
import { claimOwner, canManageKeys } from '../lib/operator-owner.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the first person to sign in is recorded as the owner', () => {
  assert.deepEqual(claimOwner(null, 'user-a'), { owner: 'user-a', claimed: true });
});

t('once an owner is recorded, a later sign-in does not change it', () => {
  assert.deepEqual(claimOwner('user-a', 'user-b'), { owner: 'user-a', claimed: false });
});

t('only the owner can manage app keys', () => {
  assert.equal(canManageKeys('user-a', 'user-a'), true);
  assert.equal(canManageKeys('user-a', 'user-b'), false);
  assert.equal(canManageKeys(null, 'user-a'), false);
  assert.equal(canManageKeys('user-a', null), false);
});

console.log(`\n${n} passed`);
