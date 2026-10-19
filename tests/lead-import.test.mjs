import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectColumns, mapImportRows, importLabel, IMPORT_MAX_ROWS } from '../lib/lead-import.js';
import { startImport, runStep, publicJob } from '../lib/server/lead-finder-job.js';
import { hasExistingDeal } from '../lib/server/route-helpers.js';

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };

// A typical Google Maps extension export (column names differ between tools; junk columns are ignored).
const SCRAPE = [
  { title: 'Acme Plumbing', category: 'Plumber', address: '12 Galle Rd, Colombo', website: 'https://acme.lk', phone: '077 123 4567', url: 'https://www.google.com/maps/place/Acme', totalScore: '4.7', reviewsCount: '88' },
  { title: 'Acme Plumbing', category: 'Plumber', address: '12 Galle Rd, Colombo', website: 'https://acme.lk', phone: '077 123 4567', url: 'https://www.google.com/maps/place/Acme' }, // exact duplicate row
  { title: 'Fb Only Plumbers', category: 'Plumber', website: 'https://www.facebook.com/fbonlyplumbers', phone: '' }, // a Facebook page is not a website, and there is no other contact
  { title: 'Phone Only Pipes', category: 'Plumber', website: '', phone: '+94 11 234 5678' },
  { title: 'Maps Link Co', website: 'https://maps.app.goo.gl/abc123', phone: '0112223333' }, // a Maps link is not the business website
  { title: 'Mail Co', website: '', email: 'Sales@MailCo.lk; other@mailco.lk', phone: '' },
  { title: '', website: 'https://noname.lk' }, // no name
  { title: 'Nobody Ltd', website: '', phone: '', email: '' }, // no contact at all
  null, 'junk',
];

await t('columns are recognised whatever the scraper calls them; junk columns are ignored', () => {
  const c = detectColumns(['Title', 'Category', 'Address', 'Website', 'Phone', 'url', 'totalScore']);
  assert.deepEqual(c, { name: 'Title', website: 'Website', phone: 'Phone', address: 'Address', category: 'Category' });
  assert.equal(detectColumns(['Business Name', 'E-mail', 'Phone Number', 'URL']).email, 'E-mail');
  assert.equal(detectColumns(['Business Name', 'E-mail', 'Phone Number', 'URL']).website, 'URL');
  assert.deepEqual(detectColumns(['foo', 'bar']), {});
});

await t('rows become finder candidates: local phones get the country code, Maps links and social pages are not websites, duplicates and empty rows are dropped', () => {
  const { candidates, stats } = mapImportRows(SCRAPE, { label: 'plumbers colombo' });
  assert.deepEqual(stats, { rows: 8, usable: 4, noName: 1, noContact: 2, duplicate: 1, tooMany: 0 });
  const by = Object.fromEntries(candidates.map((c) => [c.business_name, c]));
  assert.equal(by['Acme Plumbing'].website, 'https://acme.lk/');
  assert.equal(by['Acme Plumbing'].whatsapp_number, '94771234567');
  assert.equal(by['Acme Plumbing'].category, 'Plumber');
  assert.equal(by['Phone Only Pipes'].whatsapp_number, '94112345678');
  assert.equal(by['Phone Only Pipes'].website, '');
  assert.equal(by['Maps Link Co'].website, ''); // Maps link dropped, phone kept
  assert.equal(by['Maps Link Co'].whatsapp_number, '94112223333');
  assert.equal(by['Mail Co'].email, 'sales@mailco.lk'); // first valid address, lower-cased
  assert.equal(by['Fb Only Plumbers'], undefined); // only a Facebook page and nothing to contact
  for (const c of candidates) assert.match(c.place_id, /^csv:[0-9a-f]{16}$/);
  assert.equal(new Set(candidates.map((c) => c.place_id)).size, candidates.length);
  assert.equal(candidates[0].search_query, 'plumbers colombo');
});

await t('a facebook page next to a phone is kept as a social link, not read as a website', () => {
  const { candidates } = mapImportRows([{ name: 'Fb Co', website: 'https://www.facebook.com/fbco', phone: '0771112222' }]);
  assert.equal(candidates[0].website, '');
  assert.ok(candidates[0].facebook.includes('fbco'));
});

await t('ids are stable between imports and the row cap is enforced; text is cleaned and length-capped', () => {
  const a = mapImportRows([{ name: 'Stable Co', phone: '0771234567' }]).candidates[0].place_id;
  const b = mapImportRows([{ name: 'stable co', phone: '+94 77 123 4567' }]).candidates[0].place_id;
  assert.equal(a, b);
  const many = Array.from({ length: IMPORT_MAX_ROWS + 25 }, (_, i) => ({ name: `Shop ${i}`, phone: `07${String(10000000 + i)}` }));
  const r = mapImportRows(many);
  assert.equal(r.candidates.length, IMPORT_MAX_ROWS);
  assert.equal(r.stats.tooMany, 25);
  const long = mapImportRows([{ name: 'x'.repeat(500) + '\n\tY', phone: '0771234567', address: 'a'.repeat(900) }]).candidates[0];
  assert.equal(long.business_name.length, 160);
  assert.equal(long.address.length, 300);
  assert.equal(importLabel('plumbers-colombo (1).csv'), 'plumbers colombo 1');
  assert.equal(importLabel(''), 'my list');
});

// ---------------------------------------------------------------- the job (in-memory store, same fakes as the finder tests)
const PUBLIC = [{ address: '93.184.216.34' }];
const lookup = async () => PUBLIC;
function makeCtx(site) {
  const calls = [];
  return { lookup, userAgent: 'test', nominatim: 'https://nominatim.test', overpass: ['https://overpass.test/api'], calls, fetch: async (url) => {
    calls.push(url);
    const u = new URL(url);
    const entry = site[u.origin + u.pathname] ?? site[u.origin + u.pathname.replace(/\/$/, '')];
    if (entry === undefined) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
    return new Response(entry, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  } };
}
function memoryDeps() {
  const mem = { job: null, delivered: [] };
  return { mem,
    load: async () => mem.job && structuredClone(mem.job),
    save: async (_u, j) => { mem.job = structuredClone(j); },
    deliver: async (_u, leads) => { const fresh = leads.filter((l) => !mem.delivered.some((d) => (d.email && d.email === l.email) || d.place_id === l.place_id)); mem.delivered.push(...fresh); return { added: fresh.length, skipped: { invalid: 0, duplicate: leads.length - fresh.length, blocked: 0, contacted: 0, known: 0 } }; },
  };
}
const SITE = { 'https://acme.lk/robots.txt': '', 'https://acme.lk/': '<html><body><h1>Acme</h1><a href="/contact">Contact</a></body></html>', 'https://acme.lk/contact': '<html><body>Write to hello@acme.lk or call +94 77 123 4567</body></html>' };

await t('an import is queued with no map request, websites are read, leads (even email-only ones) reach the inbox labelled with the list, and the browser never sees the queue', async () => {
  const deps = memoryDeps(); const ctx = makeCtx(SITE);
  const job = await startImport(null, 'u1', { label: 'plumbers-colombo.csv', rows: SCRAPE }, { deps });
  assert.deepEqual([job.status, job.source, job.location, job.stats.queued, job.stats.found, job.stats.noContact, job.stats.skipped, job.minScore], ['running', 'import-list', '', 4, 8, 3, 1, 0]);
  assert.equal(job.usage.searches, 0); // no map request, so no search used
  assert.ok(!job.candidates[0].website); // rows that need no website visit go first
  const r = await runStep(null, 'u1', { ctx, deps, deadline: Date.now() + 60000 });
  assert.equal(r.finished, true);
  assert.equal(r.added, 4);
  const acme = deps.mem.delivered.find((l) => l.business_name === 'Acme Plumbing');
  assert.equal(acme.email, 'hello@acme.lk'); // found on the website
  assert.equal(acme.campaign, 'list: plumbers colombo');
  assert.ok(deps.mem.delivered.find((l) => l.business_name === 'Mail Co').email === 'sales@mailco.lk'); // a supplied email is kept even though the lead has no website to score
  assert.ok(deps.mem.delivered.find((l) => l.business_name === 'Phone Only Pipes').whatsapp_number);
  assert.equal(ctx.calls.filter((u) => u.includes('overpass') || u.includes('nominatim')).length, 0);
  assert.equal('candidates' in publicJob(deps.mem.job), false);
});

await t('importing the same list again finds nothing new; importing while a search is running is refused; a useless file is refused', async () => {
  const deps = memoryDeps(); const ctx = makeCtx(SITE);
  await startImport(null, 'u2', { label: 'x', rows: SCRAPE }, { deps });
  await assert.rejects(() => startImport(null, 'u2', { label: 'y', rows: SCRAPE }, { deps }), (e) => e.code === 'JOB_RUNNING');
  await runStep(null, 'u2', { ctx, deps, deadline: Date.now() + 60000 });
  const again = await startImport(null, 'u2', { label: 'x', rows: SCRAPE }, { deps });
  assert.equal(again.status, 'done');
  assert.equal(again.stats.queued, 0);
  assert.match(again.note, /already imported/);
  await assert.rejects(() => startImport(null, 'u3', { label: 'z', rows: [{ foo: 'bar' }] }, { deps: memoryDeps() }), (e) => e.code === 'BAD_LIST');
});

// ---------------------------------------------------------------- never cold-email someone you already deal with
await t('the existing-deal check fails open and is wired into every automatic cold path', async () => {
  assert.equal(await hasExistingDeal(null, 'u1', ''), false);
  assert.equal(await hasExistingDeal({ broken: true }, 'u1', 'a@b.co'), false); // a database problem never blocks
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  assert.match(read('lib/server/inbox-store.js'), /hasExistingDeal\(db, uid, lead\.email\)/); // lead inbox delivery (finder, import, worker)
  assert.match(read('lib/server/queue-checks.js'), /QUEUE_KINDS\.FIRST\) return sent\.empty && !\(await hasExistingDeal/); // review window and Autosend
  assert.match(read('lib/server/prepare-drafts.js'), /hasExistingDeal\(db, uid, c\.email\)/); // overnight drafting (saves the AI call)
  assert.doesNotMatch(read('lib/server/queue-checks.js').split('\n').filter((l) => l.includes('FOLLOWUP') || l.includes('number')).join('\n'), /hasExistingDeal/); // follow-ups legitimately have a deal
});

console.log(`\n${n} lead-import tests passed`);
