// Routine messages (Pass 271): with Balancr connected, Balancr sends routine service messages; without it, AutoLeads does; an explicit choice wins.
import assert from 'node:assert/strict';
import { routineOwner } from '../lib/routine-owner.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };

t('with Balancr connected, Balancr sends the routine messages; without it, AutoLeads does', () => {
  assert.equal(routineOwner({ balancrConnected: true }), 'balancr');
  assert.equal(routineOwner({ balancrConnected: false }), 'autoleads');
});

t('an explicit choice from the owner wins over the default', () => {
  assert.equal(routineOwner({ balancrConnected: true, setting: 'autoleads' }), 'autoleads');
  assert.equal(routineOwner({ balancrConnected: false, setting: 'balancr' }), 'balancr');
});

console.log(`\n${n} passed`);
