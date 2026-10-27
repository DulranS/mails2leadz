import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseMoney, detectDealColumns, screenDeals, MIN_GROUP } from '../lib/deal-screen.js';

const car = (title, model, price, extra = {}) => ({ title, model, price, ...extra });
// Six listings of one model: median 1,000,000. One at 600k is 40% under; one at 300k is 70% under.
const vitz = [
  car('Vitz A', 'Toyota Vitz 2014', '1,000,000'),
  car('Vitz B', 'Toyota Vitz 2014', '1,000,000'),
  car('Vitz C', 'Toyota Vitz 2014', '1,000,000'),
  car('Vitz D', 'Toyota Vitz 2014', '1,000,000'),
  car('Vitz cheap', 'Toyota Vitz 2014', '600,000', { url: 'https://example.com/listing/1' }),
  car('Vitz suspicious', 'Toyota Vitz 2014', '300,000'),
];

test('a CSV with quotes, commas inside quotes and CRLF endings is read correctly', () => {
  const r = parseCsv('title,price\r\n"Honda, red ""sport""",1000\r\nVitz,2000\r\n');
  assert.deepEqual(r.headers, ['title', 'price']);
  assert.equal(r.rows[0].title, 'Honda, red "sport"');
  assert.equal(r.rows[1].price, '2000');
});

test('money reads thousands separators, currency words and k/m suffixes', () => {
  assert.equal(parseMoney('Rs. 1,250,000'), 1250000);
  assert.equal(parseMoney('LKR 1.2M'), 1200000);
  assert.equal(parseMoney('45k'), 45000);
  assert.equal(parseMoney('Call for price'), null);
  assert.equal(parseMoney(''), null);
});

test('columns are detected from their names', () => {
  const c = detectDealColumns(['Title', 'Model', 'Asking price', 'Location', 'Link']);
  assert.equal(c.price, 'Asking price');
  assert.equal(c.group, 'Model');
  assert.equal(c.url, 'Link');
});

test('a listing well under its group median is a deal; the average gross profit is after the sell fee', () => {
  const r = screenDeals({ rows: vitz, columns: { price: 'price', title: 'title', group: 'model', url: 'url' }, costs: { sellFeePct: 0.05 } });
  const cheap = r.deals.find((d) => d.title === 'Vitz cheap');
  assert.ok(cheap, 'the 40%-under listing is a deal');
  assert.equal(cheap.benchmark, 1000000);
  assert.equal(cheap.discountPct, 40);
  assert.equal(cheap.estProfit, 350000); // 1,000,000 * 0.95 - 600,000
  assert.equal(cheap.url, 'https://example.com/listing/1');
  assert.equal(r.deals.some((d) => d.title === 'Vitz A'), false); // at the median: not a deal
});

test('a listing more than 60% under its group is a check, not a deal', () => {
  const r = screenDeals({ rows: vitz, columns: { price: 'price', title: 'title', group: 'model' } });
  assert.equal(r.checks.length, 1);
  assert.equal(r.checks[0].title, 'Vitz suspicious');
  assert.equal(r.checks[0].status, 'check');
  assert.equal(r.deals.some((d) => d.title === 'Vitz suspicious'), false);
});

test('a group with too few listings gives no benchmark, so nothing is flagged from it', () => {
  const few = vitz.slice(0, MIN_GROUP - 1);
  const r = screenDeals({ rows: few, columns: { price: 'price', title: 'title', group: 'model' } });
  assert.equal(r.benchmarks.length, 0);
  assert.equal(r.smallGroups, 1);
  assert.equal(r.deals.length + r.checks.length, 0);
});

test('rows without a price are counted, not guessed', () => {
  const r = screenDeals({ rows: [...vitz, car('No price', 'Toyota Vitz 2014', 'Call')], columns: { price: 'price', title: 'title', group: 'model' } });
  assert.equal(r.unpriced, 1);
  assert.equal(r.totalRows, 7);
});

test('a cost for repairs and transport can turn a deal into a loss, and then it is not shown as a deal', () => {
  const r = screenDeals({ rows: vitz, columns: { price: 'price', title: 'title', group: 'model' }, costs: { sellFeePct: 0.05, repairCost: 400000 } });
  assert.equal(r.deals.some((d) => d.title === 'Vitz cheap'), false);
});
