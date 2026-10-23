import assert from 'node:assert/strict';
import { load, peek, stale, put, invalidate, clearAll, stats, isFresh } from '../lib/swr-cache.js';
import { asSnapshot, asDoc, cacheNameForPath, invalidatePath, TTL } from '../lib/client-data.js';
import { callMayWrite, pathOf } from '../lib/api-writes.js';
import { isShellRoute, SHELL_ROUTES, NAV_ITEMS } from '../lib/app-routes.js';

let n = 0; const t = async (name, fn) => { clearAll(); await fn(); n++; console.log('  ok -', name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const counter = (value = 'v') => { const c = { calls: 0, fn: async () => { c.calls++; return `${value}${c.calls}`; } }; return c; };

await t('a fresh copy is served without calling the fetcher again (going back to a page costs no download)', async () => {
  const c = counter();
  assert.equal(await load('u|deals', c.fn, { ttlMs: 1000 }), 'v1');
  assert.equal(await load('u|deals', c.fn, { ttlMs: 1000 }), 'v1');
  assert.equal(c.calls, 1);
  assert.equal(peek('u|deals'), 'v1');
});

await t('an expired copy is fetched again, but stale() still returns it for an instant repaint', async () => {
  const c = counter();
  await load('u|deals', c.fn, { ttlMs: 5 });
  await sleep(15);
  assert.equal(peek('u|deals', 5), undefined);
  assert.equal(stale('u|deals'), 'v1');
  assert.equal(isFresh('u|deals', 5), false);
  assert.equal(await load('u|deals', c.fn, { ttlMs: 5 }), 'v2');
});

await t('three screens asking at once share ONE download (in-flight de-duplication)', async () => {
  let calls = 0;
  const slow = async () => { calls++; await sleep(20); return 'rows'; };
  const out = await Promise.all([load('u|deals', slow), load('u|deals', slow), load('u|deals', slow)]);
  assert.deepEqual(out, ['rows', 'rows', 'rows']);
  assert.equal(calls, 1);
  assert.equal(stats().inflight, 0);
});

await t('force fetches again even when fresh', async () => {
  const c = counter();
  await load('k', c.fn, { ttlMs: 60000 });
  assert.equal(await load('k', c.fn, { ttlMs: 60000, force: true }), 'v2');
});

await t('a failed fetch is never stored, and the next ask tries again', async () => {
  let fail = true;
  const f = async () => { if (fail) throw new Error('offline'); return 'ok'; };
  await assert.rejects(load('k', f), /offline/);
  assert.equal(peek('k'), undefined);
  assert.equal(stats().inflight, 0);
  fail = false;
  assert.equal(await load('k', f), 'ok');
});

await t('invalidating drops matching entries only (prefix, regexp or predicate) and reports how many', async () => {
  put('u1|deals', 1); put('u1|invoices', 2); put('u1|page|crm', 3);
  assert.equal(invalidate('u1|deals'), 1);
  assert.equal(peek('u1|deals'), undefined);
  assert.equal(peek('u1|invoices'), 2);
  assert.equal(invalidate(/\|invoices$/), 1);
  assert.equal(invalidate((k) => k.includes('|page|')), 1);
  assert.equal(stats().entries, 0);
});

await t('a download that started BEFORE a write is not stored afterwards (it would be stale)', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  const p = load('u|deals', async () => { await gate; return 'old-rows'; });
  invalidate('u|deals'); // the write happens while the read is in flight
  release();
  assert.equal(await p, 'old-rows'); // the caller still gets its answer...
  assert.equal(peek('u|deals'), undefined); // ...but it is not kept as if it were current
  assert.equal(await load('u|deals', async () => 'new-rows'), 'new-rows');
});

await t('clearAll empties everything (sign-out / another account)', async () => {
  put('a', 1); put('b', 2);
  assert.equal(clearAll(), 2);
  assert.equal(stale('a'), undefined);
});

await t('snapshot-shaped results: ids, data(), exists(), size, forEach; data() is a copy so a page cannot corrupt the shared rows', async () => {
  const rows = [{ id: 'a', data: { email: 'x@y.z', notes: [1] } }, { id: 'b', data: { email: 'q@y.z' } }];
  const snap = asSnapshot(rows);
  assert.equal(snap.size, 2); assert.equal(snap.empty, false);
  assert.deepEqual(snap.docs.map((d) => d.id), ['a', 'b']);
  const first = snap.docs[0].data();
  first.email = 'CHANGED';
  assert.equal(snap.docs[0].data().email, 'x@y.z');
  assert.equal(snap.docs[0].exists(), true);
  const seen = []; snap.forEach((d) => seen.push(d.id)); assert.deepEqual(seen, ['a', 'b']);
  assert.equal(asSnapshot([]).empty, true);
  assert.equal(asSnapshot().size, 0);
});

await t('document-shaped results: present, absent, and a copy', async () => {
  const there = asDoc({ id: 'business', exists: true, data: { currency: 'LKR' } });
  assert.equal(there.exists(), true); assert.equal(there.data().currency, 'LKR');
  const gone = asDoc({ id: 'team', exists: false, data: undefined });
  assert.equal(gone.exists(), false); assert.equal(gone.data(), undefined);
  assert.equal(asDoc(undefined).exists(), false);
});

await t('every Firestore path a screen writes maps to the cache entry it makes stale', async () => {
  assert.equal(cacheNameForPath('deals/abc'), 'deals');
  assert.equal(cacheNameForPath('sent_emails/x'), 'sent_emails');
  assert.equal(cacheNameForPath('invoices/i1'), 'invoices');
  assert.equal(cacheNameForPath('lead_inbox/l1'), 'lead_inbox');
  assert.equal(cacheNameForPath('inbound_enquiries/e'), 'inbound_enquiries');
  assert.equal(cacheNameForPath('users/u1/settings/business'), 'settings:business');
  assert.equal(cacheNameForPath('users/u1/settings/team'), 'settings:team');
  assert.equal(cacheNameForPath('users/u1/follow_up_tasks/t1'), 'follow_up_tasks');
  assert.equal(cacheNameForPath('users/u1/content_posts'), 'content_posts');
  assert.equal(cacheNameForPath('users/u1/conversations/c'), 'conversations');
  assert.equal(cacheNameForPath('users/u1/contacts/c'), 'contacts');
  assert.equal(cacheNameForPath('ai_usage_monthly/u1_2026-10'), 'ai_month:');
  assert.equal(cacheNameForPath('something_else/x'), null);
  assert.equal(cacheNameForPath(''), null);
  assert.equal(cacheNameForPath(undefined), null);
});

await t('a write drops exactly what it changed, and keeps a screen\'s saved snapshot for instant repaint', async () => {
  put('u1|deals', 1); put('u1|invoices', 2); put('u1|settings:business', 3); put('u1|settings:team', 4); put('u1|page|crm', 5); put('u1|ai_month:2026-10', 6);
  invalidatePath('deals/abc');
  assert.equal(peek('u1|deals'), undefined);
  assert.equal(peek('u1|invoices'), 2);
  invalidatePath('users/u1/settings/business');
  assert.equal(peek('u1|settings:business'), undefined);
  assert.equal(peek('u1|settings:team'), 4); // a different settings document is untouched
  assert.equal(peek('u1|page|crm'), 5); // snapshots survive writes: they repaint instantly, then refresh behind
  invalidatePath('ai_usage_monthly/u1_2026-10');
  assert.equal(peek('u1|ai_month:2026-10'), undefined);
  assert.equal(invalidatePath('unrelated/x'), 0);
});

await t('TTLs: volatile data is short-lived, settings last longer', async () => {
  assert.ok(TTL.volatile <= 60 * 1000 && TTL.settings > TTL.volatile && TTL.moderate >= TTL.volatile);
});

await t('which server calls may have written (and so drop the cache)', async () => {
  assert.equal(callMayWrite('GET', '/api/anything'), false);
  assert.equal(callMayWrite('get', '/api/send-email'), false);
  assert.equal(callMayWrite('HEAD', '/api/x'), false);
  assert.equal(callMayWrite('POST', '/api/send-email'), true);
  assert.equal(callMayWrite('POST', '/api/ai-deal-draft'), true);
  assert.equal(callMayWrite('DELETE', '/api/lead-inbox'), true);
  assert.equal(callMayWrite('POST', '/api/ai-insights'), false);
  assert.equal(callMayWrite('POST', 'https://x.test/api/get-thread?x=1'), false);
  assert.equal(callMayWrite('POST', '/api/system-check/'), false);
  assert.equal(callMayWrite(undefined, '/api/send-email'), false);
  assert.equal(pathOf('/api/a/b/?q=1'), '/api/a/b');
});

await t('the persistent frame wraps exactly the app pages: not the dashboard (own frame), landing, enquiry form, legal or admin', async () => {
  for (const p of ['/business', '/inbox', '/content', '/conversations', '/crm', '/customers', '/billing', '/stock', '/bets', '/sops', '/account', '/crm/', '/crm?x']) assert.equal(isShellRoute(p.replace('?x', '')), true, p);
  for (const p of ['/', '/dashboard', '/enquire', '/privacy', '/terms', '/unsubscribe', '/admin', '/leads', '/crmx', '', null, undefined]) assert.equal(isShellRoute(p), false, String(p));
  assert.equal(SHELL_ROUTES.length, 11);
  assert.deepEqual(NAV_ITEMS.map((i) => i.href).filter((h) => h !== '/dashboard').sort(), [...SHELL_ROUTES].sort()); // sidebar and frame agree
});

console.log(`\n${n} client-cache tests ok`);
