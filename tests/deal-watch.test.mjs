import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, priceFrom, rememberPrices, benchmarkFor, assessNew, sanitizeFeeds, readState, MEMORY_PER_GROUP, MEMORY_GROUPS, MAX_FEEDS } from '../lib/deal-watch.js';
import { runDealWatch, saveFeeds } from '../lib/server/deal-watch-job.js';

const NOW = Date.UTC(2026, 9, 27, 2);
const rss = (items) => `<rss><channel>${items.map((i) => `<item><title>${i.t}</title><link>${i.l}</link><description>${i.d || ''}</description></item>`).join('')}</channel></rss>`;

test('RSS items: CDATA titles, escaped descriptions, web links only, no duplicates', () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[Toyota Vitz 2014 Rs. 1,250,000]]></title><link>https://example.com/a</link><description>&lt;p&gt;Low km&lt;/p&gt;</description></item>
    <item><title>Duplicate</title><link>https://example.com/a</link></item>
    <item><title>No link</title></item>
    <item><title>Script link</title><link>javascript:alert(1)</link></item>
  </channel></rss>`;
  const items = parseFeed(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Toyota Vitz 2014 Rs. 1,250,000');
  assert.equal(items[0].description, 'Low km');
});

test('Atom entries: the link comes from the href attribute', () => {
  const items = parseFeed('<feed><entry><title>Land 10 perches Colombo 7</title><link rel="alternate" href="https://example.com/land/9"/><summary>LKR 8.5 lakh</summary></entry></feed>');
  assert.equal(items[0].link, 'https://example.com/land/9');
  assert.equal(items[0].description, 'LKR 8.5 lakh');
});

test('prices: currency-marked amounts win; lakh and k are read; mileage and years are not prices', () => {
  assert.equal(priceFrom('Toyota Vitz 2014 Rs. 1,250,000'), 1250000);
  assert.equal(priceFrom('Land 10 perches LKR 8.5 lakh'), 850000);
  assert.equal(priceFrom('Rs 45k bike'), 45000);
  assert.equal(priceFrom('Toyota 2014 120,000 km'), null);
  assert.equal(priceFrom('Year 2014 low mileage, call'), null);
});

test('a group earns a typical price only after enough observations, and the memory is capped', () => {
  let m = rememberPrices({}, [1e6, 1e6, 1e6, 6e5].map((p, i) => ({ title: `Toyota Vitz 2014 ${i}`, price: p })), NOW);
  assert.equal(benchmarkFor(m, 'toyota vitz 2014'), 1e6);
  assert.equal(benchmarkFor(rememberPrices({}, [{ title: 'Toyota Vitz 2014', price: 1e6 }], NOW), 'toyota vitz 2014'), null);
  const many = Array.from({ length: 40 }, (_, i) => ({ title: 'Toyota Vitz 2014', price: 1e6 + i }));
  m = rememberPrices({}, many, NOW);
  assert.equal(m['toyota vitz 2014'].p.length, MEMORY_PER_GROUP);
  const groups = Array.from({ length: MEMORY_GROUPS + 5 }, (_, i) => ({ title: `Model${i} Brand`, price: 1e6 }));
  assert.ok(Object.keys(rememberPrices({}, groups, NOW)).length <= MEMORY_GROUPS);
});

test('new listings are judged against memory from before tonight, never against themselves', () => {
  const memory = rememberPrices({}, [1e6, 1e6, 1e6, 1e6].map((p) => ({ title: 'Toyota Vitz 2014', price: p })), NOW);
  const found = assessNew([
    { title: 'Toyota Vitz 2014 Hybrid', link: 'https://e.example/1', price: 6e5 },   // 40% under: a deal
    { title: 'Toyota Vitz 2014 Used', link: 'https://e.example/2', price: 3e5 },     // 70% under: check first
    { title: 'Toyota Vitz 2014 Fair', link: 'https://e.example/3', price: 9e5 },     // 10% under: not flagged
    { title: 'Honda Fit 2010', link: 'https://e.example/4', price: 1e5 },            // no memory for this group yet
  ], memory, { sellFeePct: 0.05 });
  assert.deepEqual(found.map((d) => d.status), ['deal', 'check']);
  assert.equal(found[0].estProfit, 350000);
  assert.equal(found[0].benchmark, 1e6);
});

test('feeds: web links only, no duplicates, at most five, and the rest is reported back', () => {
  const r = sanitizeFeeds(['https://a.example/feed', 'javascript:alert(1)', 'https://a.example/feed', 'ftp://x.example/f']);
  assert.equal(r.feeds.length, 1);
  assert.equal(r.bad.length, 2);
  assert.equal(sanitizeFeeds(Array.from({ length: MAX_FEEDS + 1 }, (_, i) => `https://f${i}.example/x`)).tooMany, true);
  assert.equal(readState({ feeds: [{ url: 'javascript:x' }] }).feeds.length, 0);
});

// An in-memory store with the same shape as the Firestore one, so the whole nightly run is exercised.
function memoryStore(initial) {
  let st = readState(initial);
  return {
    load: async () => structuredClone(st),
    save: async (_uid, s) => { st = structuredClone(s); },
    markUser: async () => {},
    peek: () => st,
  };
}

test('a nightly run learns from the first feed, flags only what is new and cheap on the next night, and names a feed it cannot read', async () => {
  const store = memoryStore({ feeds: [{ url: 'https://feeds.example/a', label: 'a' }, { url: 'https://feeds.example/b', label: 'b' }] });
  let feedA = rss([1, 2, 3, 4].map((i) => ({ t: `Toyota Vitz 2014 ${i}`, l: `https://e.example/v${i}`, d: 'Rs. 1,000,000' }))
    .concat([{ t: 'Toyota Vitz 2014 Cheap', l: 'https://e.example/cheap', d: 'Rs. 600,000' }]));
  const fetchFeed = async (url) => (url.endsWith('/a') ? { ok: true, text: feedA } : { ok: false, status: 500 });

  const night1 = await runDealWatch(null, 'u1', { now: NOW, fetchFeed, store });
  assert.equal(night1.fresh, 5);
  assert.equal(night1.found, 0, 'the first night only learns prices');
  assert.deepEqual(night1.failed, ['b']);
  assert.match(night1.note, /Checked 1 of 2 feeds/);

  feedA = feedA.replace('</channel>', `<item><title>Toyota Vitz 2014 Used</title><link>https://e.example/used</link><description>Rs. 300,000</description></item></channel>`);
  const night2 = await runDealWatch(null, 'u1', { now: NOW + 864e5, fetchFeed, store });
  assert.equal(night2.fresh, 1, 'listings already seen are not read again');
  assert.equal(night2.found, 1);
  const saved = store.peek();
  assert.equal(saved.deals[0].status, 'check');
  assert.equal(saved.deals[0].link, 'https://e.example/used');
  assert.equal(saved.seen.length, 6);
});

test('saving feeds for an owner keeps the good ones and reports the bad ones', async () => {
  const store = memoryStore({});
  const r = await saveFeeds(null, 'u1', { urls: ['https://feeds.example/a', 'javascript:x'], costs: { sellFeePct: 0.1 } }, store);
  assert.equal(r.saved, true);
  assert.equal(r.feeds.length, 1);
  assert.equal(r.bad.length, 1);
  assert.equal(store.peek().costs.sellFeePct, 0.1);
  const big = await saveFeeds(null, 'u1', { urls: Array.from({ length: MAX_FEEDS + 2 }, (_, i) => `https://f${i}.example/x`) }, store);
  assert.equal(big.saved, false, 'too many feeds saves nothing');
});
