// Time entries (Pass 148): validated, summed per customer, and the quote shows the actual rate once hours are logged.
import assert from 'node:assert/strict';
import { sanitizeTimeEntry, loggedHoursFor } from '../lib/time-log.js';
import { quoteEconomics, quoteEconomicsLine } from '../lib/quote-economics.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const now = Date.parse('2026-11-03T10:00:00Z');

t('a time entry needs a customer, 0.05 to 24 hours, and a real day that is not in the future', () => {
  assert.equal(sanitizeTimeEntry({ hours: 2 }, { now }).error, "Enter the customer's email address.");
  assert.match(sanitizeTimeEntry({ dealEmail: 'ann@example.com', hours: 0 }, { now }).error, /Hours must be/);
  assert.match(sanitizeTimeEntry({ dealEmail: 'ann@example.com', hours: 25 }, { now }).error, /Hours must be/);
  assert.match(sanitizeTimeEntry({ dealEmail: 'ann@example.com', hours: 1, date: '2026-13-40' }, { now }).error, /valid day/);
  assert.match(sanitizeTimeEntry({ dealEmail: 'ann@example.com', hours: 1, date: '2027-01-01' }, { now }).error, /future/);
});

t('a valid entry is normalised: lowercase address, hours to 2 places, note trimmed', () => {
  const r = sanitizeTimeEntry({ dealEmail: ' Ann@Example.com ', hours: '1.333', date: '2026-11-02', note: '  setup   call ' }, { now });
  assert.deepEqual(r.entry, { dealEmail: 'ann@example.com', hours: 1.33, date: '2026-11-02', note: 'setup call' });
});

t('logged hours add up for one customer only', () => {
  const entries = [{ dealEmail: 'ann@example.com', hours: 2 }, { dealEmail: 'ann@example.com', hours: 1.5 }, { dealEmail: 'bob@example.com', hours: 9 }];
  assert.equal(loggedHoursFor(entries, 'ANN@example.com'), 3.5);
  assert.equal(loggedHoursFor(entries, 'nobody@example.com'), 0);
});

t('once hours are logged, the quote shows the actual rate next to the estimate', () => {
  const e = quoteEconomics({ total: 600, estimatedHours: 8, hourlyRate: 100, loggedHours: 10 });
  assert.equal(e.actualRate, 60);
  assert.equal(e.effectiveRate, 75);
  assert.match(quoteEconomicsLine(e), /Logged: 10 hours, about 60\.00 an hour, under your 100\.00 an hour\./);
});

t('logged hours alone are enough to show a rate; nothing shows with neither', () => {
  assert.equal(quoteEconomics({ total: 600, loggedHours: 4 }).actualRate, 150);
  assert.equal(quoteEconomics({ total: 600 }), null);
});

console.log(`\n${n} passed`);
