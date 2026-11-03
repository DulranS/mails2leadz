// What a quote pays per hour (Pass 147): estimated hours are optional and validated; the rate is checked against the owner's rate.
import assert from 'node:assert/strict';
import { quoteEconomics, quoteEconomicsLine } from '../lib/quote-economics.js';
import { sanitizeQuote } from '../lib/quote-core.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const base = { title: 'Website care plan', email: 'ann@example.com', lines: [{ description: 'Care', qty: 1, unitPrice: 600 }] };

t('a quote without estimated hours has no rate line', () => {
  assert.equal(quoteEconomics({ total: 600 }), null);
  assert.equal(quoteEconomicsLine(null), '');
});

t('the effective rate is the total over the estimated hours, flagged below the owner\'s rate', () => {
  const e = quoteEconomics({ total: 600, estimatedHours: 8, hourlyRate: 100 });
  assert.equal(e.effectiveRate, 75);
  assert.equal(e.belowRate, true);
  assert.match(quoteEconomicsLine(e), /Estimate: about 75\.00 an hour over 8 hours, under your 100\.00 an hour/);
  const ok = quoteEconomics({ total: 600, estimatedHours: 4, hourlyRate: 100 });
  assert.equal(ok.belowRate, false);
  assert.match(quoteEconomicsLine(ok), /Estimate: about 150\.00 an hour over 4 hours, at or above your 100\.00/);
});

t('without an hourly rate the line states the rate only', () => {
  assert.equal(quoteEconomics({ total: 600, estimatedHours: 6 }).targetRate, null);
  assert.equal(quoteEconomicsLine(quoteEconomics({ total: 600, estimatedHours: 6 })), 'Estimate: about 100.00 an hour over 6 hours.');
});

t('the quote keeps optional estimated hours and refuses nonsense', () => {
  const kept = sanitizeQuote({ ...base, estimatedHours: '12.5' });
  assert.equal(kept.quote.estimatedHours, 12.5);
  assert.equal(sanitizeQuote({ ...base, estimatedHours: '' }).quote.estimatedHours, null);
  assert.equal(sanitizeQuote({ ...base }).quote.estimatedHours, null);
  assert.match(sanitizeQuote({ ...base, estimatedHours: -3 }).error, /Estimated hours/);
});

console.log(`\n${n} passed`);
