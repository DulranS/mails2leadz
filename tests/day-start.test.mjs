// Start of day (Pass 181): the call list is prepared (never dialled), and the day is started once.
import assert from 'node:assert/strict';
import { callToday, dayAlreadyStarted } from '../lib/day-start.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the call list has open deals first (biggest value), then new leads; closed deals and numbers-less people are left out', () => {
  const list = callToday({
    deals: [
      { businessName: 'Small Co', phone: '+94 77 111 2222', stage: 'qualified', value: 100 },
      { businessName: 'Big Co', phone: '+94771113333', stage: 'proposal', value: 900 },
      { businessName: 'Won Co', phone: '+94771114444', stage: 'closed_won', value: 5000 },
      { businessName: 'No Phone', stage: 'proposal', value: 800 },
    ],
    leads: [{ businessName: 'New Lead', phone: '+94771115555', status: 'new' }, { businessName: 'Replied', phone: '+94771116666', status: 'replied' }],
  });
  assert.deepEqual(list.map((x) => x.name), ['Big Co', 'Small Co', 'New Lead']);
  assert.equal(list[1].phone, '+94771112222');
  assert.match(list[0].why, /Open deal worth 900\.00/);
});

t('the same number is listed once, and the list is capped', () => {
  const deals = Array.from({ length: 30 }, (_, i) => ({ businessName: `Co ${i}`, phone: `+9477${String(100000 + i)}`, stage: 'qualified', value: i }));
  deals.push({ businessName: 'Duplicate', phone: '+9477100001', stage: 'qualified', value: 1 });
  const list = callToday({ deals, limit: 15 });
  assert.equal(list.length, 15);
  assert.equal(new Set(list.map((x) => x.phone)).size, list.length);
});

t('the day is started once: the same date key is not started again', () => {
  assert.equal(dayAlreadyStarted('2026-11-05', '2026-11-05'), true);
  assert.equal(dayAlreadyStarted('2026-11-04', '2026-11-05'), false);
  assert.equal(dayAlreadyStarted(undefined, '2026-11-05'), false);
});

console.log(`\n${n} passed`);
