// Pass 304: the KPI figures can be read for an exact from-to range (spec 6.7), and the Support today panel shows the category counts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { customDayRange, KPI_RANGE_MAX_MONTHS } from '../lib/kpi-range.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000;
const NOW = Date.parse('2026-11-15T06:00:00Z');

t('a from-to range covers both days in full', () => {
  const r = customDayRange('2026-10-01', '2026-10-31', NOW);
  assert.equal(r.start, Date.parse('2026-10-01T00:00:00Z'));
  assert.equal(r.end, Date.parse('2026-11-01T00:00:00Z'));
  assert.equal(r.months, 1);
});

t('a one-day range is valid', () => {
  const r = customDayRange('2026-11-14', '2026-11-14', NOW);
  assert.equal(r.end - r.start, DAY);
});

t('bad input is rejected, not guessed at', () => {
  assert.equal(customDayRange('2026-02-31', '2026-03-01', NOW), null, 'a day that does not exist');
  assert.equal(customDayRange('01/10/2026', '2026-10-31', NOW), null, 'wrong format');
  assert.equal(customDayRange('', '', NOW), null, 'empty');
  assert.equal(customDayRange('2026-10-31', '2026-10-01', NOW), null, 'reversed');
  assert.equal(customDayRange('2027-01-01', '2027-01-31', NOW), null, 'starts in the future');
});

t('a range longer than the limit is refused', () => {
  assert.equal(customDayRange('2024-01-01', '2026-06-30', NOW), null);
  assert.ok(KPI_RANGE_MAX_MONTHS === 24);
});

t('the KPI route checks every window against the range end, and reads the range', () => {
  const src = fs.readFileSync('app/api/kpis/route.js', 'utf8');
  assert.ok(src.includes("customDayRange(request.nextUrl.searchParams.get('from'), request.nextUrl.searchParams.get('to'), now)"));
  assert.ok(src.includes('const inWindow = (t) => t && Date.parse(t) <= end && end - Date.parse(t) <= WINDOW;'));
  assert.ok(src.includes('const monthCut = new Date(end - WINDOW)'));
  assert.ok(src.includes('end - t > WINDOW'));
});

t('the page asks for the range, shows it in the heading, and can go back to months', () => {
  const src = fs.readFileSync('app/components/SupportAndKpis.js', 'utf8');
  assert.ok(src.includes('&from=${range.from}&to=${range.to}'));
  assert.ok(src.includes('aria-label="From date"') && src.includes('aria-label="To date"'));
  assert.ok(src.includes('Use months'));
  assert.ok(src.includes('Questions by type'));
});

console.log(`gap-close-304: ${n} checks passed`);
