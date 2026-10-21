import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeLines, computeLineComparison, MAX_LINES } from '../lib/lines.js';
import { buildDealWrite } from '../lib/deal-utils.js';

const won = (line, value, deliveryCost, winReason = '') => ({ stage: 'closed_won', line, value, deliveryCost, winReason });

test('lines are cleaned, unique, limited', () => {
  assert.deepEqual(sanitizeLines(' Web design \n\nweb design\nCar resale\n'), ['Web design', 'Car resale']);
  assert.equal(sanitizeLines(['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7']).length, MAX_LINES);
  assert.equal(sanitizeLines('x'.repeat(100))[0].length, 40);
  assert.deepEqual(sanitizeLines(null), []);
  assert.deepEqual(sanitizeLines([1, {}, null, 'ok']), ['1', 'ok']);
});

test('one line or none: no comparison is shown', () => {
  assert.equal(computeLineComparison({ deals: [won('A', 100, 10)], lines: ['A'] }).verdict, null);
  assert.equal(computeLineComparison({ deals: [], lines: [] }).rows.length, 0);
});

test('too little data says what is missing, never picks a winner', () => {
  assert.match(computeLineComparison({ deals: [], lines: ['A', 'B'] }).verdict, /first win/);
  assert.match(computeLineComparison({ deals: [won('', 100, 10)], lines: ['A', 'B'] }).verdict, /Tag each customer/);
  const thin = computeLineComparison({ deals: [won('A', 100, 10), won('B', 100, 10)], lines: ['A', 'B'] });
  assert.match(thin.verdict, /3 wins with a delivery cost/);
  assert.equal(thin.bestName, null);
});

test('profit per deal ranks the lines once each has enough costed wins; untagged wins are counted', () => {
  const deals = [
    ...[1, 2, 3].map(() => won('Service', 1000, 200, 'only_option')),
    ...[1, 2, 3].map(() => won('Resale', 3000, 2700, 'price')),
    won('service', 500, null), won('', 400, 0),
  ];
  const c = computeLineComparison({ deals, lines: ['Service', 'Resale'] });
  const s = c.rows.find((r) => r.name === 'Service');
  const r = c.rows.find((x) => x.name === 'Resale');
  assert.deepEqual([s.wins, s.costed, s.profit, s.profitPerDeal, s.marginPct], [4, 3, 2400, 800, 80]);
  assert.deepEqual([r.wins, r.profitPerDeal, r.marginPct], [3, 300, 10]);
  assert.equal(s.stickyPct, 100);
  assert.equal(r.stickyPct, 0);
  assert.equal(c.bestName, 'Service');
  assert.equal(c.untagged, 1);
  assert.match(c.verdict, /Service earns the most per deal \(800\)/);
});

test('deal write keeps a clean short line or clears it', () => {
  const base = { uid: 'u', email: 'a@x.com', stage: 'closed_won' };
  assert.equal(buildDealWrite({ ...base, line: '  Web\ndesign ' }).line, 'Web design');
  assert.equal(buildDealWrite({ ...base, line: 'x'.repeat(90) }).line.length, 40);
  assert.equal(buildDealWrite({ ...base, line: '' }).line, null);
  assert.equal('line' in buildDealWrite(base), false);
});
