// Polite crawling (Pass 169): Crawl-delay from robots.txt is honoured, a busy host is left alone, and a busy answer is remembered.
import assert from 'node:assert/strict';
import { parseCrawlDelay, pacerFor, safeGet } from '../lib/server/lead-finder-io.js';

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };

await t('Crawl-delay is read from robots.txt in seconds, and capped at ten', async () => {
  assert.equal(parseCrawlDelay('User-agent: *\nCrawl-delay: 2\nDisallow: /x'), 2000);
  assert.equal(parseCrawlDelay('crawl-delay: 1.5'), 1500);
  assert.equal(parseCrawlDelay('Crawl-delay: 99'), 10000);
  assert.equal(parseCrawlDelay('User-agent: *\nDisallow: /'), 0);
});

await t('requests to one host are spaced by its Crawl-delay', async () => {
  const ctx = {};
  const p = pacerFor(ctx);
  p.setDelay('https://site.example', 60);
  const start = Date.now();
  await p.wait('https://site.example/a');
  await p.wait('https://site.example/b');
  await p.wait('https://site.example/c');
  assert.ok(Date.now() - start >= 110, 'three requests take at least two gaps');
});

await t('a host that answered busy is left alone for a while, and is not asked again', async () => {
  let asked = 0;
  const ctx = { fetch: async () => { asked++; return new Response('busy', { status: 503, headers: { 'retry-after': '30' } }); }, lookup: async () => [{ address: '93.184.216.34', family: 4 }] };
  const first = await safeGet('https://busy.example/contact', ctx);
  assert.equal(first.ok, false);
  assert.equal(asked, 1);
  assert.equal(pacerFor(ctx).backedOff('https://busy.example/about'), true);
  const second = await safeGet('https://busy.example/about', ctx);
  assert.equal(second.error, 'backoff');
  assert.equal(asked, 1, 'no second request while the host is backed off');
});

console.log(`\n${n} passed`);
