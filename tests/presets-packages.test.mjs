// Presets and packages (Pass 215): starting journeys are templates only; packages are priced the same way and compared.
import assert from 'node:assert/strict';
import { JOURNEY_PRESETS } from '../lib/journey-presets.js';
import { parsePackages, comparePackages } from '../lib/packages.js';
import { parseJourney } from '../lib/journey.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('every starting journey reads as a valid journey', () => {
  for (const [id, p] of Object.entries(JOURNEY_PRESETS)) {
    const r = parseJourney(p.text);
    assert.equal(r.skipped, 0, id);
    assert.ok(r.steps.length >= 2, id);
  }
});

t('packages are read from lines, and compared cheapest first with the same tax and deposit', () => {
  const { packages, skipped } = parsePackages('Basic | 100 | 1 | Setup\nPro | 80 | 3 | Setup, support\nbad line');
  assert.equal(packages.length, 2);
  assert.equal(skipped, 1);
  const c = comparePackages(packages, { taxPct: 10, depositPct: 50 });
  assert.equal(c[0].name, 'Basic', 'Basic costs 110 with tax, Pro costs 264');
  assert.equal(c[0].quote.total, 110);
  const pro = c.find((p) => p.name === 'Pro');
  assert.equal(pro.quote.total, 264);
  assert.equal(pro.quote.deposit, 132);
});

console.log(`\n${n} passed`);
