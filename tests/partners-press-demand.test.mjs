// Partners, press and demand (Pass 216): accounts carry a type; reminders name the type; demand is read from received leads.
import assert from 'node:assert/strict';
import { parseAccounts, abmActions } from '../lib/abm.js';
import { demandTrend } from '../lib/demand.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000, now = Date.parse('2026-11-06T12:00:00Z');

t('accounts are read with an optional type; an unknown type falls back to customer', () => {
  const a = parseAccounts('Big Co | ceo@big.co\nCafe Partner | owner@cafe.lk | partner\nDaily News | desk@news.lk | Press\nOdd | x@y.z | spaceship');
  assert.deepEqual(a.map((x) => x.type), ['customer', 'partner', 'press', 'customer']);
});

t('a reminder names what kind of contact it is', () => {
  const acts = abmActions([{ name: 'Cafe Partner', type: 'partner' }, { name: 'Daily News', type: 'press', lastTouchAt: new Date(now - 20 * DAY).toISOString() }], now);
  assert.match(acts[0].why, /partner/);
  assert.match(acts[1].why, /publication/);
});

t('demand is rising, falling or steady from the last thirty days against the thirty before', () => {
  const leads = [
    ...Array.from({ length: 12 }, (_, i) => ({ receivedAt: new Date(now - (i + 1) * DAY).toISOString(), source: 'meta' })),
    ...Array.from({ length: 6 }, (_, i) => ({ receivedAt: new Date(now - (35 + i) * DAY).toISOString(), source: 'google' })),
  ];
  const d = demandTrend(leads, now);
  assert.equal(d.last30, 12);
  assert.equal(d.prev30, 6);
  assert.equal(d.changePct, 100);
  assert.equal(d.direction, 'rising');
  assert.equal(d.topSources[0].source, 'meta');
  assert.equal(demandTrend([], now).direction, 'none');
});

console.log(`\n${n} passed`);
