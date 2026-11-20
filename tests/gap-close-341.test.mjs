// Pass 341: the gaps left after pass 340, closed in code. Bad-review alerts, custom-field filters, Pipedrive v2, Xero and QuickBooks,
// GA4 traffic figures, the Balancr event receiver, and the missed-call text-back.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeReview, isOpenAlert, reviewAlerts, openAlertCount, isBadReview, REVIEW_TEXT_MAX } from '../lib/reviews.js';
import { buildTodayActions } from '../lib/today-actions.js';
import { NAV_ITEMS, SHELL_ROUTES } from '../lib/app-routes.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// 1. Bad-review alerts
const TODAY = '2026-11-19';
t('a rating is a whole number from 1 to 5', () => {
  for (const bad of [0, 6, 2.5, 'x', undefined]) assert.equal(sanitizeReview({ rating: bad }, { today: TODAY }).ok, false);
  assert.equal(sanitizeReview({ rating: 1 }, { today: TODAY }).ok, true);
  assert.equal(sanitizeReview({ rating: '5' }, { today: TODAY }).review.rating, 5);
});
t('review text is capped at 1000 characters and never cut short', () => {
  assert.equal(REVIEW_TEXT_MAX, 1000);
  assert.equal(sanitizeReview({ rating: 3, text: 'a'.repeat(1001) }, { today: TODAY }).ok, false);
  assert.equal(sanitizeReview({ rating: 3, text: 'a'.repeat(1000) }, { today: TODAY }).review.text.length, 1000);
});
t('the customer email is optional, but a wrong one is refused', () => {
  assert.equal(sanitizeReview({ rating: 3, customerEmail: '' }, { today: TODAY }).review.customerEmail, '');
  assert.equal(sanitizeReview({ rating: 3, customerEmail: 'Ann@Firm.LK' }, { today: TODAY }).review.customerEmail, 'ann@firm.lk');
  assert.equal(sanitizeReview({ rating: 3, customerEmail: 'not-an-email' }, { today: TODAY }).ok, false);
});
t('the date defaults to today and must be a real day', () => {
  assert.equal(sanitizeReview({ rating: 3 }, { today: TODAY }).review.date, TODAY);
  assert.equal(sanitizeReview({ rating: 3, date: '2026-02-30' }, { today: TODAY }).ok, false);
  assert.equal(sanitizeReview({ rating: 3, date: '19/11/2026' }, { today: TODAY }).ok, false);
});
t('a new review starts unanswered', () => assert.equal(sanitizeReview({ rating: 1 }, { today: TODAY }).review.answeredAt, null));
t('two stars or fewer is bad; three or more is not', () => {
  assert.equal(isBadReview({ rating: 2 }), true);
  assert.equal(isBadReview({ rating: 1 }), true);
  assert.equal(isBadReview({ rating: 3 }), false);
});
t('a bad review is an alert until it is marked answered', () => {
  assert.equal(isOpenAlert({ rating: 2, answeredAt: null }), true);
  assert.equal(isOpenAlert({ rating: 2, answeredAt: '2026-11-19T10:00:00.000Z' }), false);
  assert.equal(isOpenAlert({ rating: 4, answeredAt: null }), false);
});
t('open alerts are listed newest first and counted', () => {
  const list = [
    { id: 'a', rating: 1, date: '2026-11-01', answeredAt: null },
    { id: 'b', rating: 2, date: '2026-11-10', answeredAt: null },
    { id: 'c', rating: 2, date: '2026-11-12', answeredAt: '2026-11-13T00:00:00.000Z' },
    { id: 'd', rating: 5, date: '2026-11-15', answeredAt: null },
  ];
  assert.deepEqual(reviewAlerts(list).map((r) => r.id), ['b', 'a']);
  assert.equal(openAlertCount(list), 2);
  assert.equal(openAlertCount([]), 0);
});
t('the Do now list shows open bad reviews with one place to go', () => {
  const [item] = buildTodayActions({ badReviewAlerts: 2 });
  assert.equal(item.text, '2 bad reviews (2 stars or fewer) have no reply yet');
  assert.equal(item.href, '/reviews');
  assert.equal(buildTodayActions({ badReviewAlerts: 0 }).length, 0);
});
t('the reviews page is inside the app frame and on the sidebar', () => {
  assert.ok(SHELL_ROUTES.includes('/reviews'));
  assert.ok(NAV_ITEMS.some((x) => x.href === '/reviews'));
});
t('the server count reads users/{uid}/reviews', () => {
  assert.match(read('lib/server/today-actions.js'), /collection\(db, 'users', uid, 'reviews'\)/);
  assert.match(read('lib/server/reviews.js'), /collection\(db, 'users', String\(uid\), 'reviews'\)/);
});

// 2. Custom-field filters on the Customers page
import { sanitizeFilter, matchesFilter, applyCustomFilters, FILTER_OPS } from '../lib/custom-fields.js';
const FDEFS = [
  { key: 'vip', label: 'VIP', type: 'yesno' },
  { key: 'budget', label: 'Budget', type: 'number' },
  { key: 'renews', label: 'Renews', type: 'date' },
  { key: 'notes', label: 'Notes', type: 'text' },
];
const ROWS = [
  { name: 'Ann', customFields: { vip: true, budget: 900, renews: '2026-12-01', notes: 'Prefers email' } },
  { name: 'Bob', customFields: { vip: false, budget: 1500, renews: '2027-03-10', notes: 'Call first' } },
  { name: 'Cy', customFields: { budget: 50 } },
];
const names = (f) => applyCustomFilters(ROWS, FDEFS, f).map((r) => r.name);

t('yes/no equals yes or no', () => {
  assert.deepEqual(FILTER_OPS.yesno, ['equals']);
  assert.deepEqual(names([{ key: 'vip', op: 'equals', value: 'yes' }]), ['Ann']);
  assert.deepEqual(names([{ key: 'vip', op: 'equals', value: 'no' }]), ['Bob']);
});
t('number at least and at most, inclusive', () => {
  assert.deepEqual(names([{ key: 'budget', op: 'atLeast', value: '900' }]), ['Ann', 'Bob']);
  assert.deepEqual(names([{ key: 'budget', op: 'atMost', value: 900 }]), ['Ann', 'Cy']);
  assert.deepEqual(names([{ key: 'budget', op: 'atLeast', value: '1,000' }]), ['Bob']);
});
t('date before and after, the day itself does not count', () => {
  assert.deepEqual(names([{ key: 'renews', op: 'before', value: '2026-12-01' }]), []);
  assert.deepEqual(names([{ key: 'renews', op: 'after', value: '2026-12-01' }]), ['Bob']);
  assert.deepEqual(names([{ key: 'renews', op: 'before', value: '2027-01-01' }]), ['Ann']);
});
t('text contains, not case-sensitive', () => {
  assert.deepEqual(names([{ key: 'notes', op: 'contains', value: 'EMAIL' }]), ['Ann']);
  assert.deepEqual(names([{ key: 'notes', op: 'contains', value: 'call' }]), ['Bob']);
});
t('a customer with no value never passes a filter', () => {
  assert.equal(matchesFilter({ type: 'number', op: 'atMost', value: 1e9 }, null), false);
  assert.equal(matchesFilter({ type: 'text', op: 'contains', value: 'a' }, undefined), false);
});
t('filters combine: every one must pass', () => {
  assert.deepEqual(names([{ key: 'budget', op: 'atLeast', value: 100 }, { key: 'vip', op: 'equals', value: 'no' }]), ['Bob']);
});
t('a filter that cannot be read is ignored, so the list is not emptied by accident', () => {
  assert.equal(sanitizeFilter({ key: 'nope', op: 'equals', value: 'yes' }, FDEFS), null);
  assert.equal(sanitizeFilter({ key: 'budget', op: 'contains', value: 'x' }, FDEFS), null);
  assert.equal(sanitizeFilter({ key: 'budget', op: 'atLeast', value: '' }, FDEFS), null);
  assert.equal(sanitizeFilter({ key: 'renews', op: 'before', value: '2026-02-30' }, FDEFS), null);
  assert.equal(sanitizeFilter({ key: 'vip', op: 'equals', value: 'maybe' }, FDEFS), null);
  assert.equal(names([{ key: 'nope', op: 'equals', value: 'yes' }]).length, 3);
  assert.equal(applyCustomFilters(ROWS, FDEFS, []).length, 3);
});
t('a custom value source can be given (the deal or the saved values by email)', () => {
  const rows = [{ email: 'a@x.com' }, { email: 'b@x.com' }];
  const saved = { 'a@x.com': { budget: 700 } };
  const out = applyCustomFilters(rows, FDEFS, [{ key: 'budget', op: 'atLeast', value: 500 }], (r) => saved[r.email] || {});
  assert.deepEqual(out.map((r) => r.email), ['a@x.com']);
});
t('the customers page applies the filters and shows the filter editor', () => {
  const page = read('app/customers/page.js');
  assert.match(page, /applyCustomFilters\(tabList, fieldDefs, customFilters/);
  assert.match(page, /<CustomFieldFilters defs=\{fieldDefs\}/);
  assert.match(read('app/components/CustomFieldFilters.js'), /FILTER_OPS/);
});

// 3. Pipedrive: every call on v2
import { pipedriveBaseUrl, firstPipedriveMatch } from '../lib/crm.js';
t('the Pipedrive base is v2', () => assert.equal(pipedriveBaseUrl('acme'), 'https://acme.pipedrive.com/api/v2'));
t('no Pipedrive call in the code uses v1', () => {
  for (const f of ['lib/crm.js', 'lib/server/crm.js']) assert.doesNotMatch(read(f), /api\/v1|\/v1\//, f);
});
t('every Pipedrive request is built on the v2 base', () => {
  const src = read('lib/server/crm.js');
  const urls = [...src.matchAll(/fetchImpl\(`([^`]+)`/g)].map((m) => m[1]);
  assert.ok(urls.length >= 5, 'expected the person search, person create, deal read, deal create and deal update calls');
  for (const u of urls.filter((x) => x.includes('pipedrive') || x.startsWith('${base}'))) assert.match(u, /^\$\{base\}\//, u);
});
t('person search: the v2 query (term, fields, exact_match, limit) and the item id at data.items[0].item.id', () => {
  const src = read('lib/server/crm.js');
  assert.match(src, /\/persons\/search\?term=.*&fields=email&exact_match=true&limit=1/);
  assert.equal(firstPipedriveMatch({ success: true, data: { items: [{ result_score: 0.5, item: { id: 42 } }] } }), '42');
  assert.equal(firstPipedriveMatch({ data: { items: [] } }), null);
});

// 4. Xero and QuickBooks: connect, push once, poll payments. No network: fetch and the store are mocked.
import {
  clientKeysSet, authorizeUrl, exchangeCode, buildXeroInvoice, buildQboInvoice, xeroPaymentState, qboPaymentState, paidPatch,
  pushDecision, runPush, runPoll, isAccepted, PUSH_FIELD, CLAIM_MS,
} from '../lib/accounting-sync.js';

const ENV = { XERO_CLIENT_ID: 'x-id', XERO_CLIENT_SECRET: 'x-secret', QBO_CLIENT_ID: 'q-id', QBO_CLIENT_SECRET: 'q-secret', QBO_SERVICE_ITEM_ID: '7', QBO_TAX_CODE_ID: 'TAX', XERO_TAX_TYPE: 'OUTPUT2' };
const NOW = Date.parse('2026-11-19T10:00:00Z');
const INV = { id: 'i1', userId: 'u1', number: 'AL-0001', businessName: 'Acme Ltd', email: 'ap@acme.com', issuedAt: '2026-11-10T09:00:00Z', dueAt: '2026-12-10T09:00:00Z', note: 'Consulting', amount: 100, taxAmount: 12, total: 112, status: 'open' };
const ta = async (name, fn) => { await fn(); n++; };

function memStore(conn = {}, invoices = []) {
  const inv = invoices.map((i) => ({ ...i }));
  return {
    conn, inv,
    store: {
      async loadConnection(s) { return conn[s] ? { ...conn[s] } : null; },
      async saveRefreshToken(s, tok) { conn[s] = { ...(conn[s] || {}), refreshToken: tok }; },
      async saveTenantId(s, id) { conn[s] = { ...(conn[s] || {}), tenantId: id }; },
      async listInvoices() { return inv.map((i) => ({ ...i })); },
      async updateInvoice(id, patch) {
        const r = inv.find((i) => i.id === id);
        for (const [k, v] of Object.entries(patch)) { if (v === null) delete r[k]; else r[k] = v; }
      },
    },
  };
}
// routes: [{ re, method, status, body }]; every call is recorded in calls. An unmocked URL throws, so nothing reaches the network.
function mockFetch(routes) {
  const calls = [];
  const f = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push({ url: String(url), method, headers: opts.headers || {}, body: opts.body });
    const hit = routes.find((r) => r.re.test(String(url)) && (r.method || 'GET') === method);
    if (!hit) throw new Error(`unmocked ${method} ${url}`);
    const status = hit.status || 200;
    return { ok: status < 300, status, json: async () => hit.body };
  };
  f.calls = calls;
  return f;
}
const TOKEN_OK = { re: /identity\.xero\.com\/connect\/token|oauth\.platform\.intuit\.com/, method: 'POST', body: { access_token: 'a1', refresh_token: 'r2' } };

await ta('not configured: no keys means a state, and no call is made', async () => {
  assert.equal(clientKeysSet('xero', {}), false);
  assert.equal(clientKeysSet('xero', { XERO_CLIENT_ID: 'x' }), false);
  assert.equal(clientKeysSet('quickbooks', { QBO_CLIENT_ID: 'q', QBO_CLIENT_SECRET: 's' }), true);
  const { store } = memStore({ xero: { refreshToken: 'r1', tenantId: 't1' } }, [INV]);
  const f = mockFetch([]);
  const out = await runPush({ store, system: 'xero', env: {}, fetchImpl: f });
  assert.equal(out.error, 'not_configured');
  assert.equal(f.calls.length, 0);
  assert.equal((await runPoll({ store, system: 'quickbooks', env: {}, fetchImpl: f })).error, 'not_configured');
  assert.equal((await runPush({ store, system: 'myob', env: ENV, fetchImpl: f })).error, 'unknown_system');
});
await ta('not connected: a configured system with no saved grant is a state too', async () => {
  const { store } = memStore({}, [INV]);
  const f = mockFetch([]);
  assert.equal((await runPush({ store, system: 'xero', env: ENV, fetchImpl: f })).error, 'not_connected');
  assert.equal(f.calls.length, 0);
});
await ta('the consent link carries the client id, redirect, state and the scopes', async () => {
  const u = new URL(authorizeUrl('xero', { clientId: 'x-id', redirectUri: 'https://app.example/api/accounting/xero/callback', state: 'S1' }));
  assert.equal(u.origin + u.pathname, 'https://login.xero.com/identity/connect/authorize');
  assert.equal(u.searchParams.get('client_id'), 'x-id');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://app.example/api/accounting/xero/callback');
  assert.equal(u.searchParams.get('state'), 'S1');
  assert.match(u.searchParams.get('scope'), /offline_access.*accounting\.invoices/);
  assert.match(authorizeUrl('quickbooks', { clientId: 'q', redirectUri: 'r', state: 's' }), /appcenter\.intuit\.com\/connect\/oauth2/);
});
await ta('token exchange uses the client keys in a Basic header, and a failure never echoes the body', async () => {
  const ok = mockFetch([TOKEN_OK]);
  const t = await exchangeCode('xero', { code: 'C', redirectUri: 'R' }, ENV, ok);
  assert.equal(t.refresh_token, 'r2');
  const sent = ok.calls[0];
  assert.equal(sent.headers.Authorization, `Basic ${Buffer.from('x-id:x-secret').toString('base64')}`);
  assert.match(String(sent.body), /grant_type=authorization_code/);
  const bad = mockFetch([{ re: /identity\.xero/, method: 'POST', status: 400, body: { error: 'invalid_grant', secret: 'LEAK-ME' } }]);
  await assert.rejects(exchangeCode('xero', { code: 'C', redirectUri: 'R' }, ENV, bad), (e) => e.code === 'invalid_grant' && !String(e.message).includes('LEAK'));
});
t('an invoice is accepted when issued, numbered, positive and not void or draft', () => {
  assert.equal(isAccepted(INV), true);
  assert.equal(isAccepted({ ...INV, status: 'void' }), false);
  assert.equal(isAccepted({ ...INV, status: 'draft' }), false);
  assert.equal(isAccepted({ ...INV, number: '' }), false);
  assert.equal(isAccepted({ ...INV, issuedAt: '' }), false);
  assert.equal(isAccepted({ ...INV, amount: 0, total: 0 }), false);
});
t('Xero body: a sales invoice, net unit amount, tax by TaxType, contact and dates', () => {
  const b = buildXeroInvoice(INV, { accountCode: '200', taxType: 'OUTPUT2' });
  assert.equal(b.ok, true);
  assert.equal(b.body.Type, 'ACCREC');
  assert.equal(b.body.InvoiceNumber, 'AL-0001');
  assert.equal(b.body.Contact.Name, 'Acme Ltd');
  assert.equal(b.body.Contact.EmailAddress, 'ap@acme.com');
  assert.equal(b.body.Date, '2026-11-10');
  assert.equal(b.body.DueDate, '2026-12-10');
  assert.equal(b.body.LineAmountTypes, 'Exclusive');
  assert.deepEqual(b.body.LineItems[0], { Description: 'Consulting', Quantity: 1, UnitAmount: 100, AccountCode: '200', TaxType: 'OUTPUT2' });
});
t('Xero body: tax with no TaxType is refused, not sent half-built; a void invoice is refused', () => {
  assert.deepEqual(buildXeroInvoice(INV, { accountCode: '200' }), { ok: false, reason: 'tax_type' });
  assert.equal(buildXeroInvoice({ ...INV, status: 'void' }).reason, 'not_accepted');
});
t('QuickBooks body: customer, service item and net unit price, with the tax code when there is tax', () => {
  const b = buildQboInvoice(INV, { customerId: 'c5', itemId: '7', taxCodeId: 'TAX' });
  assert.equal(b.ok, true);
  assert.deepEqual(b.body.CustomerRef, { value: 'c5' });
  assert.equal(b.body.DocNumber, 'AL-0001');
  assert.equal(b.body.Line[0].Amount, 100);
  assert.deepEqual(b.body.Line[0].SalesItemLineDetail, { ItemRef: { value: '7' }, Qty: 1, UnitPrice: 100, TaxCodeRef: { value: 'TAX' } });
  assert.equal(buildQboInvoice(INV, { itemId: '7', taxCodeId: 'TAX' }).reason, 'customer');
  assert.equal(buildQboInvoice(INV, { customerId: 'c5', taxCodeId: 'TAX' }).reason, 'item');
  assert.equal(buildQboInvoice(INV, { customerId: 'c5', itemId: '7' }).reason, 'tax_code');
});
t('payment status: Xero PAID, QuickBooks balance zero; part payments are not paid', () => {
  assert.equal(xeroPaymentState({ Status: 'PAID', AmountPaid: 112, AmountDue: 0 }).paid, true);
  assert.equal(xeroPaymentState({ Status: 'AUTHORISED', AmountPaid: 50, AmountDue: 62 }).paid, false);
  assert.equal(qboPaymentState({ TotalAmt: 112, Balance: 0 }).paid, true);
  const part = qboPaymentState({ TotalAmt: 112, Balance: 50 });
  assert.equal(part.paid, false);
  assert.equal(part.amountPaid, 62);
});
t('a paid invoice here changes only status and time; part payments change nothing', () => {
  const p = paidPatch(INV, { paid: true }, 'xero', NOW);
  assert.deepEqual(p, { status: 'paid', paidAt: '2026-11-19T10:00:00.000Z', paidVia: 'xero_sync' });
  assert.equal(paidPatch(INV, { paid: false }, 'xero', NOW), null);
  assert.equal(paidPatch({ ...INV, status: 'paid' }, { paid: true }, 'xero', NOW), null);
});
t('no double push: an invoice with an external id, or a fresh claim, is never pushed again', () => {
  assert.equal(pushDecision({ ...INV, xeroInvoiceId: 'x9' }, 'xero', { now: NOW }).reason, 'already_pushed');
  assert.equal(pushDecision({ ...INV, qboInvoiceId: 'q9' }, 'quickbooks', { now: NOW }).reason, 'already_pushed');
  assert.equal(pushDecision({ ...INV, xeroPushingAt: new Date(NOW - 60000).toISOString() }, 'xero', { now: NOW }).reason, 'in_progress');
  assert.equal(pushDecision({ ...INV, xeroPushingAt: new Date(NOW - CLAIM_MS - 1000).toISOString() }, 'xero', { now: NOW }).push, true);
  assert.equal(pushDecision(INV, 'xero', { connected: false, now: NOW }).reason, 'not_connected');
  assert.equal(pushDecision({ ...INV, status: 'draft' }, 'xero', { now: NOW }).reason, 'not_accepted');
  assert.equal(PUSH_FIELD.xero, 'xeroInvoiceId');
});
await ta('Xero push: one PUT per invoice, the id is saved, the rotated token is kept, and a second run sends nothing', async () => {
  const { store, conn, inv } = memStore({ xero: { refreshToken: 'r1', tenantId: 't1' } }, [INV]);
  const f = mockFetch([TOKEN_OK, { re: /api\.xero\.com\/api\.xro\/2\.0\/Invoices$/, method: 'PUT', body: { Invoices: [{ InvoiceID: 'xero-1' }] } }]);
  const first = await runPush({ store, system: 'xero', env: ENV, fetchImpl: f, now: NOW });
  assert.equal(first.pushed, 1);
  const put = f.calls.find((c) => c.method === 'PUT');
  assert.equal(put.headers.Authorization, 'Bearer a1');
  assert.equal(put.headers['Xero-tenant-id'], 't1');
  assert.equal(JSON.parse(put.body).Invoices[0].InvoiceNumber, 'AL-0001');
  assert.equal(inv[0].xeroInvoiceId, 'xero-1');
  assert.equal(inv[0].xeroPushingAt, undefined);
  assert.equal(conn.xero.refreshToken, 'r2');
  const second = await runPush({ store, system: 'xero', env: ENV, fetchImpl: f, now: NOW });
  assert.equal(second.pushed, 0);
  assert.equal(second.reasons.already_pushed, 1);
  assert.equal(f.calls.filter((c) => c.method === 'PUT').length, 1, 'no second push');
});
await ta('Xero push: the company id is found from the connections list when it is not stored', async () => {
  const { store, conn } = memStore({ xero: { refreshToken: 'r1' } }, []);
  const f = mockFetch([TOKEN_OK, { re: /api\.xro|api\.xero\.com\/connections/, body: [{ tenantId: 'tt', tenantType: 'ORGANISATION' }] }]);
  await runPush({ store, system: 'xero', env: ENV, fetchImpl: f, now: NOW });
  assert.equal(conn.xero.tenantId, 'tt');
});
await ta('a failed push releases the claim, and the next run pushes it once', async () => {
  const { store, inv } = memStore({ xero: { refreshToken: 'r1', tenantId: 't1' } }, [INV]);
  const bad = mockFetch([TOKEN_OK, { re: /Invoices$/, method: 'PUT', status: 400, body: { Message: 'secret detail' } }]);
  const r1 = await runPush({ store, system: 'xero', env: ENV, fetchImpl: bad, now: NOW });
  assert.equal(r1.failed, 1);
  assert.equal(r1.lastError, '400');
  assert.equal(inv[0].xeroPushingAt, undefined);
  assert.equal(inv[0].xeroInvoiceId, undefined);
  const good = mockFetch([TOKEN_OK, { re: /Invoices$/, method: 'PUT', body: { Invoices: [{ InvoiceID: 'xero-2' }] } }]);
  assert.equal((await runPush({ store, system: 'xero', env: ENV, fetchImpl: good, now: NOW })).pushed, 1);
  assert.equal(inv[0].xeroInvoiceId, 'xero-2');
});
await ta('QuickBooks push: finds or creates the customer, then one invoice, and never again', async () => {
  const { store, inv } = memStore({ quickbooks: { refreshToken: 'r1', tenantId: 'realm9' } }, [INV]);
  const f = mockFetch([
    TOKEN_OK,
    { re: /realm9\/query\?/, body: { QueryResponse: {} } },
    { re: /realm9\/customer\?/, method: 'POST', body: { Customer: { Id: 'c5' } } },
    { re: /realm9\/invoice\?/, method: 'POST', body: { Invoice: { Id: 'q77' } } },
  ]);
  const out = await runPush({ store, system: 'quickbooks', env: ENV, fetchImpl: f, now: NOW });
  assert.equal(out.pushed, 1);
  assert.equal(inv[0].qboInvoiceId, 'q77');
  const body = JSON.parse(f.calls.find((c) => /realm9\/invoice\?/.test(c.url)).body);
  assert.equal(body.CustomerRef.value, 'c5');
  assert.equal(body.Line[0].SalesItemLineDetail.ItemRef.value, '7');
  assert.equal((await runPush({ store, system: 'quickbooks', env: ENV, fetchImpl: f, now: NOW })).pushed, 0);
  assert.equal(f.calls.filter((c) => /realm9\/invoice\?/.test(c.url)).length, 1);
});
await ta('QuickBooks push with no service item is a mapping gap: nothing is sent', async () => {
  const { store } = memStore({ quickbooks: { refreshToken: 'r1', tenantId: 'realm9' } }, [INV]);
  const f = mockFetch([TOKEN_OK]);
  const out = await runPush({ store, system: 'quickbooks', env: { ...ENV, QBO_SERVICE_ITEM_ID: '' }, fetchImpl: f, now: NOW });
  assert.equal(out.pushed, 0);
  assert.equal(out.reasons.item, 1);
  assert.equal(f.calls.filter((c) => /realm9/.test(c.url)).length, 0, 'no QuickBooks company call is made');
});
await ta('payment poll: a paid invoice becomes paid; a part payment does not, and paid ones are not read again', async () => {
  const { store, inv } = memStore({ xero: { refreshToken: 'r1', tenantId: 't1' } }, [{ ...INV, xeroInvoiceId: 'xero-1' }]);
  const paid = mockFetch([TOKEN_OK, { re: /Invoices\/xero-1$/, body: { Invoices: [{ Status: 'PAID', AmountPaid: 112, AmountDue: 0 }] } }]);
  const r = await runPoll({ store, system: 'xero', env: ENV, fetchImpl: paid, now: NOW });
  assert.equal(r.paid, 1);
  assert.equal(inv[0].status, 'paid');
  assert.equal(inv[0].paidVia, 'xero_sync');
  assert.equal((await runPoll({ store, system: 'xero', env: ENV, fetchImpl: paid, now: NOW })).checked, 0);
});
await ta('payment poll: a Xero part payment leaves the invoice open; QuickBooks zero balance marks it paid', async () => {
  const { store, inv } = memStore({ xero: { refreshToken: 'r1', tenantId: 't1' }, quickbooks: { refreshToken: 'r1', tenantId: 'realm9' } }, [{ ...INV, xeroInvoiceId: 'xero-1', qboInvoiceId: 'q77' }]);
  const part = mockFetch([TOKEN_OK, { re: /Invoices\/xero-1$/, body: { Invoices: [{ Status: 'AUTHORISED', AmountPaid: 50, AmountDue: 62 }] } }]);
  assert.equal((await runPoll({ store, system: 'xero', env: ENV, fetchImpl: part, now: NOW })).paid, 0);
  assert.equal(inv[0].status, 'open');
  const qbo = mockFetch([TOKEN_OK, { re: /realm9\/invoice\/q77/, body: { Invoice: { Id: 'q77', TotalAmt: 112, Balance: 0 } } }]);
  assert.equal((await runPoll({ store, system: 'quickbooks', env: ENV, fetchImpl: qbo, now: NOW })).paid, 1);
  assert.equal(inv[0].status, 'paid');
});
t('wiring: the callbacks are public, the routes exist, and tokens are sealed by the vault', () => {
  const proxy = read('proxy.js');
  assert.match(proxy, /'\/api\/accounting\/xero\/callback'/);
  assert.match(proxy, /'\/api\/accounting\/quickbooks\/callback'/);
  for (const f of ['app/api/accounting/[system]/route.js', 'app/api/accounting/[system]/callback/route.js', 'app/api/accounting/sync/route.js']) assert.ok(fs.existsSync(new URL(`../${f}`, import.meta.url)), f);
  assert.match(read('lib/server/accounting-store.js'), /encryptSecret\(refreshToken\)/);
  assert.match(read('app/api/accounting/[system]/callback/route.js'), /verifyState\(p\.get\('state'\)\)/);
  assert.match(read('app/api/accounting/sync/route.js'), /VIEWER_READ_ONLY/);
});

// 5. Website traffic on the Dashboard: GA4 Data API, last 28 days, with a not-configured state. fetch is mocked.
import { googleAccessToken, ga4Report, ga4ReportBody, isFresh, trafficView, GA4_DAYS, TRAFFIC_FRESH_MS } from '../lib/traffic.js';
const GENV = { NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret' };
const ga4Body = { rows: [{ metricValues: [{ value: '1200' }, { value: '860' }, { value: '0.4567' }] }] };

await ta('the 28-day report asks for sessions, users and bounce rate up to yesterday', async () => {
  assert.equal(GA4_DAYS, 28);
  assert.deepEqual(ga4ReportBody(), { dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }], metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'bounceRate' }] });
});
await ta('the Google token comes from the refresh token with the sign-in client keys, and is empty without one', async () => {
  const f = mockFetch([{ re: /oauth2\.googleapis\.com\/token/, method: 'POST', body: { access_token: 'ya29' } }]);
  assert.equal(await googleAccessToken('rt', GENV, f), 'ya29');
  assert.match(String(f.calls[0].body), /client_id=g-id/);
  assert.match(String(f.calls[0].body), /refresh_token=rt/);
  assert.equal(await googleAccessToken('', GENV, f), '');
});
await ta('a GA4 reading: Bearer token to runReport on the property, with the figures and the bounce rate as a percentage', async () => {
  const f = mockFetch([{ re: /analyticsdata\.googleapis\.com\/v1beta\/properties\/123456:runReport/, method: 'POST', body: ga4Body }]);
  const r = await ga4Report({ token: 'ya29', propertyId: '123456', fetchImpl: f, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.sessions, 1200);
  assert.equal(r.users, 860);
  assert.equal(r.bouncePct, 45.7);
  assert.equal(r.days, 28);
  assert.equal(r.at, '2026-11-19T10:00:00.000Z');
  assert.equal(f.calls[0].headers.Authorization, 'Bearer ya29');
  assert.deepEqual(JSON.parse(f.calls[0].body), ga4ReportBody());
});
await ta('a refused permission (403) gives a reason to show, and nothing is thrown', async () => {
  const f = mockFetch([{ re: /runReport/, method: 'POST', status: 403, body: { error: 'PERMISSION_DENIED' } }]);
  const r = await ga4Report({ token: 'ya29', propertyId: '1', fetchImpl: f, now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.reason, /reconnect Google with the analytics permission/);
});
await ta('no data yet, a network failure, no property and no token each give a reason', async () => {
  const empty = mockFetch([{ re: /runReport/, method: 'POST', body: { rows: [] } }]);
  assert.equal((await ga4Report({ token: 't', propertyId: '1', fetchImpl: empty, now: NOW })).reason, 'no data yet');
  const broken = async () => { throw new Error('offline'); };
  assert.equal((await ga4Report({ token: 't', propertyId: '1', fetchImpl: broken, now: NOW })).reason, 'could not read');
  assert.equal((await ga4Report({ token: 't', propertyId: '', fetchImpl: empty, now: NOW })).reason, 'no property');
  assert.equal((await ga4Report({ token: '', propertyId: '1', fetchImpl: empty, now: NOW })).reason, 'no token');
  assert.equal(empty.calls.length, 1, 'only the call with a token and a property is made');
});
t('not configured is a state: no property, or no Google connection, says what to set up', () => {
  assert.deepEqual(trafficView(null, { hasProperty: false, hasRefresh: true }).state, 'not_configured');
  assert.match(trafficView(null, { hasProperty: false, hasRefresh: true }).text, /GA4 property ID/);
  assert.match(trafficView(null, { hasProperty: true, hasRefresh: false }).text, /analytics permission/);
});
t('a failed reading is shown with its reason, never as zero', () => {
  const v = trafficView({ ok: false, reason: 'no data yet' }, { hasProperty: true, hasRefresh: true });
  assert.equal(v.state, 'unavailable');
  assert.equal(v.text, 'Website traffic is not shown yet: no data yet.');
});
t('a good reading reads as a sentence with the bounce rate', () => {
  const v = trafficView({ ok: true, sessions: 1200, users: 860, bouncePct: 45.7, days: 28 }, { hasProperty: true, hasRefresh: true });
  assert.equal(v.state, 'ready');
  assert.equal(v.text, 'Last 28 days: 1200 sessions, 860 visitors, bounce rate 45.7%.');
  assert.equal(trafficView({ ok: true, sessions: 0, users: 0, bouncePct: null, days: 28 }, { hasProperty: true, hasRefresh: true }).text, 'Last 28 days: 0 sessions, 0 visitors, bounce rate n/a.');
});
t('a saved reading is reused for 12 hours, then refreshed', () => {
  assert.equal(TRAFFIC_FRESH_MS, 12 * 60 * 60 * 1000);
  assert.equal(isFresh('2026-11-19T04:00:00.000Z', NOW), true);
  assert.equal(isFresh('2026-11-18T20:00:00.000Z', NOW), false);
  assert.equal(isFresh('', NOW), false);
});
t('wiring: the Dashboard mounts the traffic card, the route exists, the old helper uses the shared report, and sign-in asks for analytics.readonly', () => {
  assert.match(read('app/dashboard/page.js'), /<TrafficFigures \/>/);
  assert.ok(fs.existsSync(new URL('../app/api/traffic/route.js', import.meta.url)));
  assert.match(read('lib/server/ga4-report.js'), /ga4Report\(\{ token, propertyId, fetchImpl: f, now \}\)/);
  assert.match(read('lib/connect.js'), /analytics\.readonly/);
});

// 6. Balancr event receiver: signed, timestamped, deduplicated, and invoice.paid lands on the customer's timeline
import crypto from 'node:crypto';
import { signEvent, verifyEvent, parseEvent, eventAction, paymentSummary, paymentEmail, paymentWrites, MAX_SKEW_MS } from '../lib/balancr-events.js';
const SECRET = 's3cret-341';
const RAW = JSON.stringify({ id: 'evt-1', type: 'invoice.paid', businessId: 'biz-9', ownerUid: 'u1', occurredAt: '2026-11-19T09:30:00Z', data: { customerEmail: 'Ann@Firm.com', amount: 250, currency: 'usd', invoiceNumber: 'INV-7' } });

t('the signature is HMAC-SHA256 of "timestamp.body", as a hex string (vector computed here)', () => {
  const ts = '1763544600000';
  const vector = crypto.createHmac('sha256', SECRET).update(`${ts}.${RAW}`).digest('hex');
  assert.match(vector, /^[0-9a-f]{64}$/);
  assert.equal(signEvent(ts, RAW, SECRET), vector);
});
t('a correctly signed, fresh request is accepted', () => {
  const now = 1763544600000;
  const sig = crypto.createHmac('sha256', SECRET).update(`${now}.${RAW}`).digest('hex');
  assert.deepEqual(verifyEvent({ timestamp: String(now), signature: sig, rawBody: RAW, secret: SECRET, now }), { ok: true });
});
t('a wrong signature, or a changed body, is 401', () => {
  const now = 1763544600000;
  const sig = crypto.createHmac('sha256', SECRET).update(`${now}.${RAW}`).digest('hex');
  assert.deepEqual(verifyEvent({ timestamp: String(now), signature: 'a'.repeat(64), rawBody: RAW, secret: SECRET, now }), { ok: false, status: 401, reason: 'bad_signature' });
  assert.equal(verifyEvent({ timestamp: String(now), signature: sig, rawBody: RAW.replace('250', '251'), secret: SECRET, now }).status, 401);
  assert.equal(verifyEvent({ timestamp: String(now), signature: 'nothex', rawBody: RAW, secret: SECRET, now }).status, 401);
});
t('a timestamp more than five minutes off is 401; exactly five minutes is allowed', () => {
  const now = 1763544600000;
  const sig = (ts) => crypto.createHmac('sha256', SECRET).update(`${ts}.${RAW}`).digest('hex');
  assert.equal(MAX_SKEW_MS, 300000);
  assert.equal(verifyEvent({ timestamp: String(now - 300001), signature: sig(now - 300001), rawBody: RAW, secret: SECRET, now }).reason, 'stale_timestamp');
  assert.equal(verifyEvent({ timestamp: String(now + 300001), signature: sig(now + 300001), rawBody: RAW, secret: SECRET, now }).reason, 'stale_timestamp');
  assert.equal(verifyEvent({ timestamp: String(now - 300000), signature: sig(now - 300000), rawBody: RAW, secret: SECRET, now }).ok, true);
  assert.equal(verifyEvent({ timestamp: 'yesterday', signature: sig(now), rawBody: RAW, secret: SECRET, now }).reason, 'bad_timestamp');
});
t('no secret set is a configuration state (503), never a crash', () => {
  assert.deepEqual(verifyEvent({ timestamp: '1', signature: 'a'.repeat(64), rawBody: RAW, secret: '' }), { ok: false, status: 503, reason: 'not_configured' });
});
t('the event body is checked: id, type, business, owner and a date', () => {
  const ok = parseEvent(RAW);
  assert.equal(ok.ok, true);
  assert.equal(ok.event.occurredAt, '2026-11-19T09:30:00.000Z');
  assert.match(parseEvent({ ...JSON.parse(RAW), id: 'bad id!' }).error, /id/);
  assert.match(parseEvent({ ...JSON.parse(RAW), businessId: '' }).error, /businessId/);
  assert.match(parseEvent({ ...JSON.parse(RAW), occurredAt: 'soon' }).error, /occurredAt/);
  assert.equal(parseEvent('not json').ok, false);
});
t('invoice.paid is recorded; any other type is ignored (answered 200 by the route)', () => {
  assert.equal(eventAction('invoice.paid'), 'record_payment');
  assert.equal(eventAction('invoice.created'), 'ignored');
  assert.equal(eventAction('business.updated'), 'ignored');
});
t('the timeline line names the amount, currency and invoice; the email must look right', () => {
  assert.equal(paymentSummary({ amount: 250, currency: 'usd', invoiceNumber: 'INV-7' }), 'Payment received: USD 250.00 for invoice INV-7 (from Balancr)');
  assert.equal(paymentSummary({}), 'Payment received (from Balancr)');
  assert.equal(paymentEmail({ customerEmail: ' Ann@Firm.com ' }), 'ann@firm.com');
  assert.equal(paymentEmail({ customerEmail: 'nobody' }), '');
});
t('the payment goes on the customer timeline, and an open deal is marked won; a closed deal is left alone', () => {
  const event = parseEvent(RAW).event;
  const open = { stage: 'proposal', email: 'ann@firm.com', stageTimes: { proposal: '2026-11-01T00:00:00.000Z' } };
  const w = paymentWrites({ uid: 'u1', event, existing: open, now: Date.parse('2026-11-19T10:00:00Z') });
  assert.equal(w.email, 'ann@firm.com');
  assert.equal(w.dealId, 'u1_ann@firm.com');
  assert.equal(w.activity.id, 'bal_evt-1');
  assert.equal(w.activity.doc.type, 'note');
  assert.equal(w.activity.doc.userId, 'u1');
  assert.equal(w.dealWrite.stage, 'closed_won');
  assert.ok(w.dealWrite.stageTimes.closed_won);
  assert.equal(paymentWrites({ uid: 'u1', event, existing: { ...open, stage: 'closed_won' } }).dealWrite, null);
  assert.equal(paymentWrites({ uid: 'u1', event, existing: null }).dealWrite, null);
  assert.equal(paymentWrites({ uid: 'u1', event: { ...event, data: {} } }), null, 'no customer email: nothing matched');
});
t('a retry writes the same timeline row (the id comes from the event)', () => {
  const event = parseEvent(RAW).event;
  const a = paymentWrites({ uid: 'u1', event, existing: null, now: 1 });
  const b = paymentWrites({ uid: 'u1', event, existing: null, now: 2 });
  assert.equal(a.activity.id, b.activity.id);
});
t('wiring: the receiver is public, checks the link and the signature, and records each id once', () => {
  const route = read('app/api/balancr/events/route.js');
  assert.match(read('proxy.js'), /'\/api\/balancr\/events'/);
  assert.match(route, /verifyEvent\(\{/);
  assert.match(route, /'balancr_link'/);
  assert.match(route, /status: 404|404\)/);
  assert.match(route, /duplicate: true/);
  assert.match(route, /'balancr_events', ev\.id/);
});


// 7. Missed-call text-back: one short text to a caller who has just rung, at most once in 24 hours, after the signature check and the lead.
import { textBackRefusal, textBackBody, validCallerNumber, TEXT_BACK_WINDOW_MS } from '../lib/missed-call-text-rules.js';
t('missed-call text-back refusals', () => {
  const now = Date.parse('2026-11-20T10:00:00Z');
  assert.equal(validCallerNumber('+94771234567'), true);
  assert.equal(validCallerNumber('0771234567'), false, 'a local number is refused, so nothing is sent to a bad address');
  assert.equal(validCallerNumber('+12'), false);
  assert.match(textBackRefusal({ from: '0771234567', lastSentAt: null, now }), /full international/);
  assert.equal(textBackRefusal({ from: '+94771234567', lastSentAt: null, now }), null, 'a first missed call gets a text');
  assert.match(textBackRefusal({ from: '+94771234567', lastSentAt: new Date(now - 3600e3).toISOString(), now }), /24 hours/, 'a second text within a day is refused');
  assert.equal(textBackRefusal({ from: '+94771234567', lastSentAt: new Date(now - TEXT_BACK_WINDOW_MS - 1000).toISOString(), now }), null, 'after 24 hours a text is allowed again');
  assert.match(textBackRefusal({ from: '+94771234567', lastSentAt: null, now, paused: true }), /paused/, 'the owner pause stops the text-back');
});
t('missed-call text wording is plain, opt-out, and short', () => {
  const body = textBackBody('Line\nbreak and a very very very very very long business name that goes on and on');
  assert.ok(body.includes('Reply STOP to opt out'));
  assert.ok(!body.includes('\n'));
  assert.ok(body.length < 200, 'a single short SMS');
});
t('missed-call route: signature first, lead recorded, then the text (which never fails the call)', () => {
  const route = read('app/api/twilio/missed-call/[uid]/route.js');
  const sig = route.indexOf('validTwilioRequest(');
  const lead = route.indexOf("lead_inbox");
  const text = route.indexOf('textBackMissedCall(');
  assert.ok(sig > 0 && sig < lead && lead < text, 'the signature is checked, then the lead, then the text');
  assert.match(route, /\.catch\(\(\) => null\)/);
});

console.log(`gap-close-341: ${n} sections passed`);
