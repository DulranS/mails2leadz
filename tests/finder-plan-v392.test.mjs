// v392: the per-search map cap (80, as the Python worker), the nightly webhook summary, and the plan preview.
// Run: node tests/finder-plan-v392.test.mjs
import assert from 'node:assert/strict';
import { searchOsm, overpassCacheApi, MAP_REQUESTS_PER_SEARCH } from '../lib/server/lead-finder-io.js';
import { nightlyNoticeText } from '../lib/server/notify-owner.js';
import { planPreview, sendNightlyNotice } from '../lib/server/lead-finder-job.js';

let n = 0;
const t = async (name, fn) => { overpassCacheApi.clear(); await fn(); n++; console.log('  ok -', name); };

// A fake map: the Colombo box splits into 16 tiles; every map request is counted.
function makeCtx() {
  const calls = [];
  return {
    calls, lookup: async () => [{ address: '93.184.216.34' }], userAgent: 'test', nominatim: 'https://nominatim.test', overpass: ['https://overpass.test/api'],
    fetch: async (url) => {
      calls.push(url);
      const u = new URL(url);
      if (u.origin === 'https://nominatim.test') return Response.json([{ boundingbox: ['6.80', '7.00', '79.80', '80.00'] }]);
      return Response.json({ elements: [] });
    },
  };
}
const overpassCalls = (ctx) => ctx.calls.filter((u) => u.startsWith('https://overpass.test')).length;

await t('the map cap is 80 requests, as the Python worker had', () => {
  assert.equal(MAP_REQUESTS_PER_SEARCH, 80);
});

await t('a search stops at its request budget and says where to resume', async () => {
  const ctx = makeCtx();
  const r = await searchOsm({ term: 'dentist', location: 'Colombo' }, ctx, { maxRequests: 3, deadline: Date.now() + 60000 });
  assert.equal(overpassCalls(ctx), 3, 'exactly the budget is spent');
  assert.equal(r.stats.partial, true);
  assert.equal(r.stats.resumeAt, 3, 'the next search of the same thing resumes at tile 3');
});

await t('a search within the budget covers every tile and is not marked partial', async () => {
  const ctx = makeCtx();
  const r = await searchOsm({ term: 'dentist', location: 'Colombo' }, ctx, { maxRequests: 80, deadline: Date.now() + 60000 });
  assert.equal(r.stats.partial, false);
  assert.equal(overpassCalls(ctx), 16);
});

await t('the nightly message says what was added, or that the search did not finish', () => {
  const ok = nightlyNoticeText({ term: 'dentist', location: 'Colombo', stats: { delivered: 5, alreadySeen: 2 } });
  assert.equal(ok.title, 'Nightly lead search finished');
  assert.equal(ok.text, 'dentist in Colombo: 5 added to your Lead Inbox, 2 already known.');
  const bad = nightlyNoticeText({ term: 'plumbers', location: '', error: 'The map servers were busy.', stats: {} });
  assert.equal(bad.title, 'Nightly lead search did not finish');
  assert.equal(bad.text, 'plumbers: The map servers were busy.');
});

await t('the plan preview gives the limits and what is left today', () => {
  const p = planPreview({ enabled: true, searches: [{}, {}] }, { searches: 2, sites: 40 });
  assert.equal(p.mapRequestsPerSearch, 80);
  assert.equal(p.businessesPerSearch, 300);
  assert.equal(p.pagesPerSite, 4);
  assert.equal(p.searchesLeft, 10);
  assert.equal(p.sitesLeft, 460);
  assert.equal(p.nightlyOn, true);
  assert.equal(p.nightlySearches, 2);
});

await t('the nightly summary goes to the owner address only when leads were added or the search did not finish', async () => {
  const sent = [];
  const send = async (url, notice) => { sent.push({ url, notice }); return { sent: true }; };
  const settings = { notifyUrl: 'https://hooks.example.com/x' };
  await sendNightlyNotice(settings, { term: 'dentist', location: 'Colombo', stats: { delivered: 3, alreadySeen: 1 }, error: '' }, send);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://hooks.example.com/x');
  assert.equal(sent[0].notice.text, 'dentist in Colombo: 3 added to your Lead Inbox, 1 already known.');
  await sendNightlyNotice(settings, { term: 'dentist', stats: { delivered: 0 }, error: '' }, send);
  await sendNightlyNotice({ notifyUrl: '' }, { term: 'dentist', stats: { delivered: 5 } }, send);
  assert.equal(sent.length, 1, 'nothing added, or no address set: no message');
  await sendNightlyNotice(settings, { term: 'dentist', stats: {}, error: 'The map servers were busy.' }, send);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].notice.title, 'Nightly lead search did not finish');
  const boom = await sendNightlyNotice(settings, { term: 'x', stats: { delivered: 1 } }, async () => { throw new Error('down'); });
  assert.equal(boom.sent, false, 'a failed message never throws');
});

console.log(`\n${n} tests passed`);
