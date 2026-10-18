import assert from 'node:assert/strict';
import { WORKER_SEARCH_TERMS } from '../lib/worker-categories.js';
import {
  categoryFilters, overpassQuery, rectFromNominatim, splitRect, tileRect, extractEmails, extractPhonesFromText, normaliseEmail, emailAcceptable,
  parsePage, candidateFromElement, calculateLeadScore, selectForInbox, sanitizeSearch, sanitizeFinderSettings, splitAreaFromQuery,
  prepareWebsite, socialFromUrl, buildRow, choosePrimaryEmail, decodeCfEmail,
} from '../lib/lead-finder.js';
import { isPrivateIp, assertPublicUrl, safeGet, makeRobots, crawlSite, searchOsm, siteToPlain } from '../lib/server/lead-finder-io.js';
import { startSearch, runStep, runNightly, saveFinderSettings, cancelJob, publicJob } from '../lib/server/lead-finder-job.js';

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };

// ---------------------------------------------------------------- fakes
const PUBLIC = [{ address: '93.184.216.34' }];
const lookup = async (host) => (host === 'private.test' ? [{ address: '10.0.0.5' }] : host === 'nodns.test' ? Promise.reject(new Error('ENOTFOUND')) : PUBLIC);
const html = (body, head = '') => `<html><head>${head}</head><body>${body}</body></html>`;
function makeCtx(site = {}, extra = {}) {
  const calls = [];
  const ctx = {
    lookup, userAgent: 'test', nominatim: 'https://nominatim.test', overpass: ['https://overpass.test/api'], calls,
    fetch: async (url, init = {}) => {
      calls.push(url);
      if (extra.fetch) { const r = await extra.fetch(url, init); if (r) return r; }
      const u = new URL(url);
      if (u.origin === 'https://nominatim.test') return Response.json([{ boundingbox: ['6.80', '7.00', '79.80', '80.00'] }]);
      if (u.origin === 'https://overpass.test') return Response.json({ elements: extra.elements || [] });
      const entry = site[u.origin + u.pathname] ?? site[u.origin + u.pathname.replace(/\/$/, '')];
      if (entry === undefined) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
      if (typeof entry === 'object') return new Response(entry.body ?? null, { status: entry.status, headers: { 'content-type': 'text/html', ...(entry.headers || {}) } });
      return new Response(entry, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    },
  };
  return ctx;
}

// ---------------------------------------------------------------- pure logic
await t('every business type the AI target finder can suggest has a real OpenStreetMap search (tags), not just a name match', () => {
  for (const term of WORKER_SEARCH_TERMS) assert.ok(categoryFilters(term).tags.length > 0, `no tags for "${term}"`);
  assert.deepEqual(categoryFilters('plumbers').tags, ['craft=plumber']);
  assert.deepEqual(categoryFilters('dental clinics').tags.includes('amenity=dentist'), true);
  assert.deepEqual(categoryFilters('submarine welders').tags.includes('craft=welder'), true);
});

await t('an unknown business type falls back to a name search; nothing typed can change the query text itself', () => {
  const f = categoryFilters('yoga');
  assert.ok(f.tags.length);
  const unknown = categoryFilters('zeppelin repair');
  assert.deepEqual([unknown.tags.length, unknown.stems], [0, ['zeppelin repair']]);
  const evil = sanitizeSearch({ query: 'dentist"];out;(node["x"', location: 'Colombo' });
  assert.ok(evil.ok);
  assert.ok(!/["\];()]/.test(evil.search.term));
  const q = overpassQuery(['amenity=dentist'], ['dent'], { south: 6.8, west: 79.8, north: 7, east: 80 }, 300, 25);
  assert.match(q, /\[out:json\]\[timeout:25\]/);
  assert.match(q, /nwr\["amenity"="dentist"\]\["name"\]\(6\.800000,79\.800000,7\.000000,80\.000000\);/);
  assert.match(q, /out tags center 300;$/);
  assert.match(overpassQuery(['tourism=hotel|guest_house'], [], { south: 1, west: 1, north: 2, east: 2 }), /\["tourism"~"\^\(hotel\|guest_house\)\$"\]/);
  assert.throws(() => overpassQuery([], [], { south: 1, west: 1, north: 2, east: 2 }));
  // name searches: the cheap key filter comes first and no regex runs over key names (that form timed out the free servers on city-sized areas)
  const named = overpassQuery([], ['plumb'], { south: 1, west: 1, north: 2, east: 2 });
  assert.match(named, /nwr\["shop"\]\["name"~"plumb",i\]\(1\.000000,1\.000000,2\.000000,2\.000000\);/);
  assert.match(named, /nwr\["industrial"\]\["name"~"plumb",i\]/);
  assert.doesNotMatch(named, /\[~"/);
  assert.equal((named.match(/nwr\[/g) || []).length, 8);
});

await t('searches: "term in place" splits; missing term or place is explained; saved searches are capped and deduplicated', () => {
  assert.deepEqual(splitAreaFromQuery('dentists in Kandy, Sri Lanka'), { term: 'dentists', place: 'Kandy, Sri Lanka' });
  const s = sanitizeSearch({ query: 'dentists in Kandy, Sri Lanka' });
  assert.deepEqual([s.ok, s.search.term, s.search.location, s.search.minScore], [true, 'dentists', 'Kandy, Sri Lanka', 40]);
  assert.equal(sanitizeSearch({ query: 'dentist' }).ok, false);
  assert.equal(sanitizeSearch({ query: 'x', location: 'Colombo' }).ok, false);
  const many = Array.from({ length: 9 }, (_, i) => ({ term: `shop ${i}`, location: 'Colombo' }));
  const cfg = sanitizeFinderSettings({ enabled: true, searches: [...many, { term: 'shop 1', location: 'colombo' }] });
  assert.equal(cfg.searches.length, 5);
  assert.equal(sanitizeFinderSettings({ enabled: 'yes' }).enabled, false); // only a real true switches it on
});

await t('bounding boxes: Nominatim order is south,north,west,east; a broken box is refused; splitting gives four cells that cover the area', () => {
  assert.deepEqual(rectFromNominatim(['6.8', '7.0', '79.8', '80.0']), { south: 6.8, west: 79.8, north: 7, east: 80 });
  assert.equal(rectFromNominatim(['7', '6', '1', '2']), null);
  assert.equal(rectFromNominatim(undefined), null);
  assert.equal(splitRect({ south: 0, west: 0, north: 2, east: 2 }).length, 4);
});

await t('emails: mailto, plain, obfuscated and Cloudflare-protected are found; image names and template addresses are not', () => {
  const found = extractEmails('Write to info@acme.lk or sales [at] acme [dot] lk. logo@2x.png noreply@example.com');
  assert.deepEqual([...found].sort(), ['info@acme.lk', 'noreply@example.com', 'sales@acme.lk']);
  assert.equal(normaliseEmail('logo@2x.png'), null);
  assert.equal(normaliseEmail('abcdefabcdefabcdefabcdef12@x.com'), null);
  assert.equal(decodeCfEmail('7a1b1a1b1a1b1a1b1a1b'.slice(0, 2)) === '', true); // too short to hold an address
  const key = 0x42; const enc = [...'hi@shop.lk'].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, '0')).join('');
  assert.equal(decodeCfEmail(key.toString(16) + enc), 'hi@shop.lk');
  assert.equal(emailAcceptable('info@acme.lk', ['acme.lk']), true);
  assert.equal(emailAcceptable('owner@gmail.com', ['acme.lk']), true);
  assert.equal(emailAcceptable('design@webagency.com', ['acme.lk']), false); // the web agency in the footer is not the business
  assert.equal(emailAcceptable('bug@sentry.io', ['sentry.io']), false);
  assert.equal(choosePrimaryEmail(['support@acme.lk', 'info@acme.lk', 'x@gmail.com'], ['acme.lk']), 'info@acme.lk');
});

await t('phones: real numbers pass; dates, year runs and fax numbers do not', () => {
  const p = extractPhonesFromText('Call us: 011 234 5678 or +94 77 123 4567. Founded 2010-2015-2020. Date 12/03/2024. Fax: 011 999 8888');
  assert.deepEqual([...p].sort(), ['+94771234567', '0112345678']);
});

await t('a web page: contact details, WhatsApp, social links and the contact page are read; other sites\' links are not followed', () => {
  const page = parsePage(html(`
    <a href="mailto:Hello@Acme.lk?subject=Hi">email</a><a href="tel:+94112345678">call</a><a href="https://wa.me/94771234567">chat</a>
    <a href="https://www.facebook.com/acmeshop">fb</a><a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a>
    <a href="https://www.linkedin.com/company/acme-lk">li</a><a href="https://www.linkedin.com/in/someone">person</a>
    <a href="/contact-us">Contact</a><a href="/blog/post-1">Blog</a><a href="https://other.com/contact">elsewhere</a><a href="/wp-admin/x">admin</a>
    <p>Visit us. Phone: 011 765 4321</p>`, '<title>Acme</title><script type="application/ld+json">{"@type":"LocalBusiness","email":"info@acme.lk","sameAs":["https://instagram.com/acme.lk"]}</script>'),
  'https://acme.lk/', ['acme.lk'], 0);
  assert.deepEqual([...page.emails].sort(), ['hello@acme.lk', 'info@acme.lk']);
  assert.ok(page.phones.has('+94112345678') && page.phones.has('+94771234567') && page.phones.has('0117654321'));
  assert.deepEqual([...page.whatsapp], ['+94771234567']);
  assert.deepEqual([page.socials.facebook, page.socials.linkedin_company, page.socials.instagram], ['https://www.facebook.com/acmeshop/', 'https://www.linkedin.com/company/acme-lk/', 'https://www.instagram.com/acme.lk/']);
  assert.equal(page.links[0][0], 'https://acme.lk/contact-us'); // the contact page comes first
  assert.ok(page.links.every(([u]) => !u.includes('other.com') && !u.includes('wp-admin')));
  assert.equal(page.links.length, 2);
});

await t('map entries: a Facebook "website" becomes a social link (not a site to read); nameless entries and bad phones are dropped', () => {
  const ok = candidateFromElement({ type: 'node', id: 7, tags: { name: 'Lanka Dental', amenity: 'dentist', website: 'https://www.facebook.com/lankadental', phone: '+94 11 222 3333;12345', 'addr:street': 'Galle Rd', 'addr:housenumber': '5', 'addr:city': 'Colombo', email: 'info@lankadental.lk' } }, 'dentist in Colombo');
  assert.deepEqual([ok.candidate.place_id, ok.candidate.website, ok.candidate.facebook, ok.candidate.whatsapp_number, ok.candidate.address, ok.candidate.category, ok.candidate.email],
    ['osm:node/7', '', 'https://www.facebook.com/lankadental/', '+94112223333', '5 Galle Rd, Colombo', 'Dentist', 'info@lankadental.lk']);
  assert.equal(candidateFromElement({ type: 'node', id: 8, tags: { amenity: 'dentist' } }).skip, 'no_name');
  assert.equal(candidateFromElement({ type: 'bogus', id: 1, tags: { name: 'x' } }).skip, 'invalid');
  assert.equal(prepareWebsite('www.acme.lk/about').startsWith('https://www.acme.lk/about'), true);
  assert.equal(prepareWebsite('info@acme.lk'), null);
  assert.equal(socialFromUrl('https://x.com/acme').kind, 'twitter');
});

await t('score is the worker\'s formula: a generic email + phone + contact page + website + one social = 56 (WARM)', () => {
  const row = buildRow({ place_id: 'osm:node/1', business_name: 'A', website: 'https://acme.lk', whatsapp_number: '', email: '', facebook: '' },
    { emails: ['info@acme.lk'], phones: ['+94112345678'], whatsapp: [], socials: { facebook: 'https://www.facebook.com/acme/' }, contactUrl: 'https://acme.lk/contact', tech: ['wordpress'] });
  assert.equal(row.lead_quality_score, 56);
  assert.deepEqual([row.email, row.contact_confidence, row.best_contact_method, row.tech_stack_detected], ['info@acme.lk', 'Medium', 'Email > Phone', 'wordpress']);
  assert.equal(calculateLeadScore({}), 0);
});

await t('inbox selection: best first, one email once, weak email dropped but the phone kept, noreply ignored, nothing without a contact', () => {
  const r = (name, email, phone, score) => ({ business_name: name, email_primary: email, whatsapp_number: phone, lead_quality_score: score });
  const { ready, reasons } = selectForInbox([
    r('Weak', 'info@weak.lk', '+94110000001', 20), r('Chain B', 'info@chain.lk', '', 60), r('Chain A', 'info@chain.lk', '', 80),
    r('NoReply', 'noreply@x.lk', '', 90), r('Nobody', '', '', 50), r('Phone only', '', '+94112223333', 10), r('WeakNoPhone', 'a@b.lk', '', 10),
  ], { minScore: 40, phoneOnlyMinScore: 0 });
  const by = Object.fromEntries(ready.map((x) => [x.business_name, x]));
  assert.deepEqual(Object.keys(by).sort(), ['Chain A', 'Phone only', 'Weak']);
  assert.equal(by.Weak.email, ''); assert.equal(by.Weak.whatsapp_number, '+94110000001');
  assert.equal(by['Chain A'].lead_quality, 'HOT');
  assert.deepEqual(reasons, { duplicate_email: 1, no_email_or_phone: 2, score_below_minimum: 1 });
});

// ---------------------------------------------------------------- network layer (fake network)
await t('only public web addresses are ever fetched: private ranges, localhost, odd ports, credentials, internal names, private DNS answers', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::1111']) assert.equal(isPrivateIp(ip), false, ip);
  const ctx = makeCtx();
  for (const bad of ['http://localhost/', 'http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://10.0.0.1/', 'https://acme.lk:8080/', 'https://user:pw@acme.lk/', 'http://intranet/', 'http://printer.local/', 'file:///etc/passwd', 'ftp://acme.lk/', 'https://private.test/', 'not a url'])
    await assert.rejects(() => assertPublicUrl(bad, ctx), (e) => e.code === 'UNSAFE_URL', bad);
  await assert.rejects(() => assertPublicUrl('https://nodns.test/', ctx), (e) => e.code === 'UNREACHABLE');
  assert.equal((await assertPublicUrl('https://acme.lk/x', ctx)).hostname, 'acme.lk');
});

await t('a redirect to an internal address is refused before anything is requested from it; non-HTML answers and errors are not pages', async () => {
  const ctx = makeCtx({ 'https://evil.test/': { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }, 'https://img.test/': { status: 200, body: 'x', headers: { 'content-type': 'image/png' } }, 'https://down.test/': { status: 503, body: 'no' } });
  const r = await safeGet('https://evil.test/', ctx);
  assert.deepEqual([r.ok, r.error], [false, 'unsafe']);
  assert.ok(!ctx.calls.some((u) => u.includes('169.254')));
  assert.equal((await safeGet('https://img.test/', ctx)).ok, false);
  assert.equal((await safeGet('https://down.test/', ctx)).status, 503);
  const loop = makeCtx({ 'https://loop.test/': { status: 302, headers: { location: 'https://loop.test/' } } });
  assert.equal((await safeGet('https://loop.test/', loop)).ok, false);
});

await t('robots.txt is honoured: disallowed paths are skipped, a missing file means allowed, a broken server means leave the site alone', async () => {
  const ctx = makeCtx({
    'https://a.test/robots.txt': 'User-agent: *\nDisallow: /private\nAllow: /private/open\n',
    'https://b.test/robots.txt': { status: 404, body: 'x' }, 'https://c.test/robots.txt': { status: 500, body: 'x' },
  });
  const allowed = makeRobots(ctx);
  assert.equal(await allowed('https://a.test/contact'), true);
  assert.equal(await allowed('https://a.test/private/data'), false);
  assert.equal(await allowed('https://a.test/private/open/page'), true);
  assert.equal(await allowed('https://b.test/anything'), true);
  assert.equal(await allowed('https://c.test/'), false);
});

const ACME = {
  'https://acme.lk/': html('<a href="/about">About</a><a href="/contact">Contact us</a><p>Welcome</p>', '<title>Acme</title>'),
  'https://acme.lk/contact': html('<h1>Contact</h1><a href="mailto:info@acme.lk">info@acme.lk</a> <a href="tel:+94112345678">call</a><a href="https://www.facebook.com/acme">fb</a>'),
  'https://acme.lk/about': html('<p>We are Acme</p>'),
};

await t('reading a website: home page, then its contact page; stops once it has everything; reports a blocked or dead site honestly', async () => {
  const ctx = makeCtx(ACME);
  const site = siteToPlain(await crawlSite('https://acme.lk/', ctx, makeRobots(ctx)));
  assert.deepEqual([site.ok, site.emails, site.phones, site.contactUrl, site.socials.facebook, site.pages], [true, ['info@acme.lk'], ['+94112345678'], 'https://acme.lk/contact', 'https://www.facebook.com/acme/', 2]);
  assert.ok(!ctx.calls.includes('https://acme.lk/about')); // enough was found: no need to read more
  const blocked = makeCtx({ ...ACME, 'https://acme.lk/robots.txt': 'User-agent: *\nDisallow: /\n' });
  const b = siteToPlain(await crawlSite('https://acme.lk/', blocked, makeRobots(blocked)));
  assert.deepEqual([b.ok, b.blocked, b.emails], [false, true, []]);
  const dead = makeCtx({});
  assert.equal((await crawlSite('https://nothing.test/', dead, makeRobots(dead))).ok, false);
  const internal = makeCtx({});
  assert.equal((await crawlSite('http://127.0.0.1/', internal, makeRobots(internal))).ok, false);
  assert.ok(!internal.calls.some((u) => u.includes('127.0.0.1')));
});

const ELEMENTS = [
  { type: 'node', id: 1, tags: { name: 'Acme Dental', amenity: 'dentist', website: 'https://acme.lk' } },
  { type: 'node', id: 2, tags: { name: 'Phone Dental', amenity: 'dentist', phone: '+94 11 555 6666' } },
  { type: 'way', id: 3, center: { lat: 1, lon: 2 }, tags: { name: 'No Contact Dental', amenity: 'dentist' } },
  { type: 'node', id: 4, tags: { amenity: 'dentist', phone: '+94 11 777 8888' } },
  { type: 'node', id: 5, tags: { name: 'Old Dental', amenity: 'dentist', phone: '+94 11 888 9999' } },
];

await t('searching the map: finds the area, lists businesses, skips nameless ones and ones found before, splits a crowded area', async () => {
  const ctx = makeCtx(ACME, { elements: ELEMENTS });
  const r = await searchOsm({ term: 'dentist', location: 'Colombo, Sri Lanka' }, ctx, { seen: new Set(['osm:node/5']) });
  assert.deepEqual(r.candidates.map((c) => c.place_id).sort(), ['osm:node/1', 'osm:node/2', 'osm:way/3']);
  assert.deepEqual([r.stats.noName, r.stats.alreadySeen, r.stats.full], [1, 1, false]);
  const calls = ctx.calls.filter((u) => u.startsWith('https://overpass.test')).length;
  const crowded = makeCtx(ACME, { elements: ELEMENTS });
  const c = await searchOsm({ term: 'dentist', location: 'Colombo' }, crowded, { limit: 3 }); // 5 elements >= limit 3: ask the four quarters too
  assert.ok(crowded.calls.filter((u) => u.startsWith('https://overpass.test')).length > calls);
  assert.ok(c.candidates.length >= 3);
  const nowhere = makeCtx({}, { fetch: async (url) => (url.startsWith('https://nominatim.test') ? Response.json([]) : null) });
  await assert.rejects(() => searchOsm({ term: 'dentist', location: 'Atlantis' }, nowhere), (e) => e.code === 'AREA_NOT_FOUND');
  const busy = makeCtx({}, { fetch: async (url) => (url.startsWith('https://overpass.test') ? new Response('busy', { status: 429 }) : null) });
  busy.overpass = ['https://overpass.test/api'];
  await assert.rejects(() => searchOsm({ term: 'dentist', location: 'Colombo' }, busy, { deadline: Date.now() + 9000 }), (e) => e.code === 'MAP_BUSY');
});

await t('searching the map: if the name search is too heavy for the free servers, the category search alone still returns leads', async () => {
  const queries = [];
  const heavy = makeCtx(ACME, {
    fetch: async (url, init) => {
      if (!url.startsWith('https://overpass.test')) return null;
      const ql = new URLSearchParams(String(init?.body || '')).get('data') || '';
      queries.push(ql);
      return /"name"~"/.test(ql) ? new Response('timeout', { status: 504 }) : Response.json({ elements: ELEMENTS.slice(0, 2) });
    },
  });
  const r = await searchOsm({ term: 'dentist', location: 'Colombo' }, heavy, { deadline: Date.now() + 40000 });
  assert.deepEqual(r.candidates.map((c) => c.place_id).sort(), ['osm:node/1', 'osm:node/2']);
  assert.equal(r.stats.degraded, true);
  assert.ok(queries.length >= 2 && /"name"~"/.test(queries[0]) && !/"name"~"/.test(queries[queries.length - 1]));
});

await t('tiles: a big area becomes small tiles, the middle first; a small area stays one; never more than 4 x 4', () => {
  const big = tileRect({ south: 6.8, west: 79.8, north: 7.0, east: 80.0 });
  assert.equal(big.length, 16);
  const mid = (t) => [(t.south + t.north) / 2, (t.west + t.east) / 2];
  const d = (t) => Math.hypot(mid(t)[0] - 6.9, mid(t)[1] - 79.9);
  assert.ok(d(big[0]) <= d(big[15])); assert.ok(d(big[3]) <= d(big[12]));
  assert.equal(tileRect({ south: 6.9, west: 79.9, north: 6.94, east: 79.95 }).length, 1);
  assert.equal(tileRect({ south: 0, west: 0, north: 20, east: 20 }).length, 16);
  const area = (r) => (r.north - r.south) * (r.east - r.west);
  assert.ok(Math.abs(big.reduce((a, r) => a + area(r), 0) - 0.04) < 1e-9); // the tiles cover the area exactly
});

await t('searching the map: a busy server (504) is skipped for the next one, and a tile nobody answers is skipped, not fatal', async () => {
  // two servers: the first always answers 504 (busy), the second works
  const two = makeCtx(ACME, {
    fetch: async (url) => (url.startsWith('https://busy.test') ? new Response('gateway timeout', { status: 504 }) : null),
    elements: ELEMENTS.slice(0, 2),
  });
  two.overpass = ['https://busy.test/api', 'https://overpass.test/api'];
  const r = await searchOsm({ term: 'dentist', location: 'Colombo' }, two, { deadline: Date.now() + 40000 });
  assert.equal(r.candidates.length, 2); assert.equal(r.stats.partial, false); // 504 is "busy", not "too big": nothing was split, nothing lost

  // one bad tile (the server never answers for that part), the rest work: leads come back, marked partial, and the bad tile is where the next search resumes
  let seenTiles = 0;
  const flaky = makeCtx(ACME, {
    fetch: async (url, init) => {
      if (!url.startsWith('https://overpass.test')) return null;
      const ql = new URLSearchParams(String(init?.body || '')).get('data') || '';
      seenTiles++;
      return seenTiles <= 4 ? new Response('busy', { status: 429 }) : Response.json({ elements: ELEMENTS.slice(0, 2) }); // the first tile fails: two tries, then the lighter category-only retry's two
    },
  });
  const p = await searchOsm({ term: 'dentist', location: 'Colombo' }, flaky, { deadline: Date.now() + 40000 });
  assert.equal(p.candidates.length, 2); assert.equal(p.stats.partial, true); assert.equal(p.stats.resumeAt, 0); assert.equal(p.stats.tilesTotal, 16);

  // resuming from a tile skips the earlier ones
  const calls = [];
  const resume = makeCtx(ACME, { fetch: async (url) => { if (url.startsWith('https://overpass.test')) calls.push(url); return null; }, elements: [] });
  await searchOsm({ term: 'dentist', location: 'Colombo' }, resume, { deadline: Date.now() + 40000, startTile: 14 });
  assert.equal(calls.length, 2);

  // nothing answers at all: an honest error after trying only a couple of tiles, not 16
  const dead = makeCtx(ACME, { fetch: async (url) => (url.startsWith('https://overpass.test') ? new Response('busy', { status: 503 }) : null) });
  await assert.rejects(() => searchOsm({ term: 'dentist', location: 'Colombo' }, dead, { deadline: Date.now() + 30000 }), (e) => e.code === 'MAP_BUSY');
  assert.ok(dead.calls.filter((u) => u.startsWith('https://overpass.test')).length <= 6);
});

// ---------------------------------------------------------------- the job (in-memory store)
function memoryDeps() {
  const mem = { job: null, settings: null, finder: null, delivered: [] };
  return {
    mem,
    load: async () => mem.job && structuredClone(mem.job),
    save: async (_u, j) => { mem.job = structuredClone(j); },
    loadSettings: async () => mem.settings && structuredClone(mem.settings),
    saveSettings: async (_u, data, merge) => { mem.settings = merge ? { ...(mem.settings || {}), ...data } : { ...data }; },
    markFinderUser: async (_u, on) => { mem.finder = on; },
    deliver: async (_u, leads) => { const fresh = leads.filter((l) => !mem.delivered.some((d) => (d.email && d.email === l.email) || d.place_id === l.place_id)); mem.delivered.push(...fresh); return { added: fresh.length, skipped: { invalid: 0, duplicate: leads.length - fresh.length, blocked: 0, contacted: 0 } }; },
  };
}

await t('a search runs as queue + steps: phone-only businesses first, websites read, good leads delivered, progress reported, nothing sent', async () => {
  const deps = memoryDeps();
  const ctx = makeCtx(ACME, { elements: ELEMENTS });
  const job = await startSearch(null, 'u1', { query: 'dentist', location: 'Colombo, Sri Lanka' }, { ctx, deps });
  assert.deepEqual([job.status, job.stats.queued, job.stats.noContact, job.candidates[0].website], ['running', 3, 1, '']); // the no-contact business is not queued; the phone-only one goes first
  const r = await runStep(null, 'u1', { ctx, deps, deadline: Date.now() + 60000 });
  assert.equal(r.finished, true);
  assert.equal(r.added, 3);
  const names = deps.mem.delivered.map((l) => l.business_name).sort();
  assert.deepEqual(names, ['Acme Dental', 'Old Dental', 'Phone Dental']);
  const acme = deps.mem.delivered.find((l) => l.business_name === 'Acme Dental');
  assert.deepEqual([acme.email, acme.lead_quality, acme.campaign], ['info@acme.lk', 'WARM', 'dentist · Colombo, Sri Lanka']);
  const pub = publicJob(deps.mem.job);
  assert.deepEqual([pub.status, pub.total, pub.done, pub.stats.delivered, pub.stats.read], ['done', 3, 3, 3, 1]);
  assert.equal('candidates' in pub, false); // the browser never sees the queue
  // asking again finds only what is new
  const again = await startSearch(null, 'u1', { query: 'dentist', location: 'Colombo, Sri Lanka' }, { ctx, deps });
  assert.equal(again.stats.queued, 0);
  assert.match(again.note, /already found/);
});

await t('a step stops at its time box and the next call carries on from the same place', async () => {
  const many = Array.from({ length: 14 }, (_, i) => ({ type: 'node', id: 100 + i, tags: { name: `Shop ${i}`, shop: 'florist', phone: `+94 11 20${i} 30${i}0` } }));
  const deps = memoryDeps();
  const fastDeliver = deps.deliver;
  deps.deliver = async (...a) => { await new Promise((r) => setTimeout(r, 150)); return fastDeliver(...a); }; // each round takes longer than the time left
  const ctx = makeCtx({}, { elements: many });
  await startSearch(null, 'u2', { query: 'florist', location: 'Kandy' }, { ctx, deps });
  const first = await runStep(null, 'u2', { ctx, deps, deadline: Date.now() + 9100 }); // room for one round only
  assert.equal(first.finished, false);
  assert.ok(deps.mem.job.cursor > 0 && deps.mem.job.cursor < 14);
  const rest = await runStep(null, 'u2', { ctx, deps, deadline: Date.now() + 60000 });
  assert.equal(rest.finished, true);
  assert.equal(deps.mem.job.cursor, 14);
  assert.equal(new Set(deps.mem.delivered.map((l) => l.place_id)).size, deps.mem.delivered.length);
});

await t('a search the map could not answer does not use up the daily allowance; a partly answered one is remembered and resumed', async () => {
  const deps = memoryDeps();
  const dead = makeCtx(ACME, { fetch: async (url) => (url.startsWith('https://overpass.test') ? new Response('busy', { status: 503 }) : null) });
  await assert.rejects(() => startSearch(null, 'u9', { query: 'dentist', location: 'Colombo' }, { ctx: dead, deps, deadline: Date.now() + 30000 }), (e) => e.code === 'MAP_BUSY');
  assert.equal(deps.mem.job, null); // nothing saved, nothing counted
  process.env.FINDER_DAILY_SEARCHES = '1';
  try {
    // one try fails completely, but the next works: the allowance of 1 is still available for it
    const ok = makeCtx(ACME, { elements: ELEMENTS });
    await startSearch(null, 'u9', { query: 'dentist', location: 'Colombo' }, { ctx: ok, deps });
    assert.equal(deps.mem.job.usage.searches, 1);
  } finally { delete process.env.FINDER_DAILY_SEARCHES; }
  // partly answered: tiles after the first four never answer
  let n = 0;
  const flaky = makeCtx(ACME, { fetch: async (url) => (url.startsWith('https://overpass.test') && ++n > 4 ? new Response('busy', { status: 503 }) : null), elements: ELEMENTS });
  const d2 = memoryDeps();
  await startSearch(null, 'u10', { query: 'dentist', location: 'Colombo' }, { ctx: flaky, deps: d2, deadline: Date.now() + 60000 });
  assert.match(d2.mem.job.note, /only part of the area/);
  assert.equal(d2.mem.job.mapProgress.key, 'dentist|Colombo'); assert.ok(d2.mem.job.mapProgress.resumeAt >= 0);
  assert.ok(d2.mem.job.candidates.length > 0);
});

await t('cancel stops a running search; the daily allowance is enforced and explained', async () => {
  const deps = memoryDeps();
  const ctx = makeCtx(ACME, { elements: ELEMENTS });
  await startSearch(null, 'u3', { query: 'dentist', location: 'Colombo' }, { ctx, deps });
  assert.equal((await cancelJob(null, 'u3', deps)).status, 'cancelled');
  assert.equal((await runStep(null, 'u3', { ctx, deps })).finished, true);
  process.env.FINDER_DAILY_SEARCHES = '2';
  try {
    await startSearch(null, 'u3', { query: 'dentist', location: 'Colombo' }, { ctx, deps });
    await assert.rejects(() => startSearch(null, 'u3', { query: 'dentist', location: 'Colombo' }, { ctx, deps }), (e) => e.code === 'DAILY_LIMIT');
  } finally { delete process.env.FINDER_DAILY_SEARCHES; }
  process.env.FINDER_DAILY_SITES = '1';
  try {
    const d2 = memoryDeps();
    const twoSites = makeCtx(ACME, { elements: [
      { type: 'node', id: 11, tags: { name: 'Acme Dental', amenity: 'dentist', website: 'https://acme.lk' } },
      { type: 'node', id: 12, tags: { name: 'Beta Dental', amenity: 'dentist', website: 'https://beta.lk' } },
    ] });
    await startSearch(null, 'u4', { query: 'dentist', location: 'Colombo' }, { ctx: twoSites, deps: d2 });
    const r = await runStep(null, 'u4', { ctx: twoSites, deps: d2, deadline: Date.now() + 60000 });
    assert.equal(r.waiting, 'daily_limit'); // one website allowed today: the second waits for tomorrow
    assert.equal(r.finished, false);
    assert.equal(d2.mem.job.cursor, 1);
    assert.equal(d2.mem.job.usage.sites, 1);
    assert.ok(!twoSites.calls.some((u) => u.includes('beta.lk'))); // and it was never visited
  } finally { delete process.env.FINDER_DAILY_SITES; }
});

await t('nightly: off does nothing; on, the saved searches take turns, and an unfinished search is continued instead of replaced', async () => {
  const deps = memoryDeps();
  const ctx = makeCtx(ACME, { elements: ELEMENTS });
  assert.equal((await runNightly(null, 'u5', { ctx, deps, deadline: Date.now() + 60000 })).skipped, 'off');
  const saved = await saveFinderSettings(null, 'u5', { enabled: true, searches: [{ term: 'dentist', location: 'Colombo' }, { term: 'florist', location: 'Kandy' }] }, deps);
  assert.deepEqual([saved.enabled, saved.searches.length, deps.mem.finder], [true, 2, true]);
  const r1 = await runNightly(null, 'u5', { ctx, deps, deadline: Date.now() + 60000 });
  assert.equal(r1.added, 3);
  assert.equal(deps.mem.job.term, 'dentist');
  assert.equal(deps.mem.settings.next, 1);
  await runNightly(null, 'u5', { ctx, deps, deadline: Date.now() + 60000 });
  assert.equal(deps.mem.job.term, 'florist'); // the second saved search had its turn
  // a half-finished manual search is continued, not replaced
  deps.mem.job = { ...deps.mem.job, status: 'running', term: 'manual one', cursor: 0, candidates: [{ place_id: 'osm:node/900', business_name: 'Manual Co', category: '', address: '', whatsapp_number: '+94112221111', website: '', email: '', facebook: '', instagram: '', search_query: '' }], stats: { ...deps.mem.job.stats } };
  await runNightly(null, 'u5', { ctx, deps, deadline: Date.now() + 60000 });
  assert.equal(deps.mem.job.term, 'manual one');
  assert.ok(deps.mem.delivered.some((l) => l.business_name === 'Manual Co'));
  const off = await saveFinderSettings(null, 'u5', { enabled: false }, deps);
  assert.deepEqual([off.enabled, deps.mem.finder], [false, false]);
});

console.log(`\n${n} lead-finder tests passed`);
