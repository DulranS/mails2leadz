// Pass 307: the Business page uses the same pause rule as the server, and forecast and at-risk follow the picked range.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { asOfTime } from '../lib/kpi-range.js';
import { autosendPausedNow } from '../lib/autosend.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.parse('2026-11-15T12:00:00Z');

t('with no range, forecast and at-risk are read as of now', () => {
  assert.equal(asOfTime(null, NOW), NOW);
});

t('with a past range, they are read as of the range end', () => {
  const end = Date.parse('2026-06-30T00:00:00Z');
  assert.equal(asOfTime({ start: end - 1000, end }, NOW), end);
});

t('a range that ends in the future is capped at now', () => {
  const end = Date.parse('2027-01-01T00:00:00Z');
  assert.equal(asOfTime({ start: NOW, end }, NOW), NOW);
});

t('the Business page treats a timed pause that has run out as not paused, like the server does', () => {
  const until = new Date(NOW - 1000).toISOString();
  assert.equal(autosendPausedNow({ autoSendPaused: true, autoSendPausedUntil: until }, NOW), false);
  const src = fs.readFileSync('app/business/page.js', 'utf8');
  assert.ok(src.includes('!autosendPausedNow(raw.autopilot)'));
  assert.ok(!src.includes('!raw.autopilot.autoSendPaused'));
});

t('the sales numbers use the range end for the forecast and the at-risk deals', () => {
  const src = fs.readFileSync('app/api/kpis/route.js', 'utf8');
  assert.ok(src.includes('const asOf = asOfTime(range, now);'));
  assert.ok(src.includes('now: asOf })'));
  assert.ok(src.includes('dealHealth(d, asOf)'));
});

console.log(`gap-close-307: ${n} checks passed`);
