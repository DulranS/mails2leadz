// Pass 340: the gaps left after pass 339, closed in code. Sri Lanka opt-in default, data-request deadlines, the customer CSV with
// custom fields, the spam-complaint rule, and the wiring of each screen.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isOptInMarket, contactBasisFor } from '../lib/consent-rules.js';
import { addWorkingDays, sanitizeRequest, requestState, requestsNeedingAttention, REQUEST_KINDS, DEADLINE_WORKING_DAYS } from '../lib/data-requests.js';
import { customersCsv, customValueText } from '../lib/customers-csv.js';
import { complaintRateStatus, COMPLAINT_LIMIT_PCT, COMPLAINT_AIM_PCT } from '../lib/sender-auth.js';
import { NAV_ITEMS, SHELL_ROUTES } from '../lib/app-routes.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Sri Lanka: marketing needs consent (PDPA 2022 s.27)
t('a .lk address is an opt-in market', () => assert.equal(isOptInMarket('ann@firm.lk'), true));
t('a .lk address gets no marketing without consent, but keeps the B2B basis', () => {
  assert.deepEqual(contactBasisFor({ email: 'ann@firm.lk' }), { basis: 'legitimate_interests_b2b', marketingAllowed: false });
});
t('a .lk address with recorded consent may be marketed to', () => {
  assert.equal(contactBasisFor({ email: 'ann@firm.lk', marketingConsent: true, consentSource: 'web form' }).marketingAllowed, true);
});
t('a US address is unchanged (no opt-in default)', () => assert.equal(isOptInMarket('ann@firm.com'), false));

// Data requests: 21 working days (PDPA s.17(1))
t('the deadline is 21 working days', () => assert.equal(DEADLINE_WORKING_DAYS, 21));
t('21 working days from Thu 19 Nov 2026 is Fri 18 Dec 2026', () => assert.equal(addWorkingDays('2026-11-19', 21), '2026-12-18'));
t('weekends are skipped: Fri 20 Nov + 1 working day is Mon 23 Nov', () => assert.equal(addWorkingDays('2026-11-20', 1), '2026-11-23'));
t('a Saturday start counts from the next Monday', () => assert.equal(addWorkingDays('2026-11-21', 1), '2026-11-23'));
t('zero working days returns the same date', () => assert.equal(addWorkingDays('2026-11-19', 0), '2026-11-19'));
t('a bad date gives null', () => assert.equal(addWorkingDays('19/11/2026', 21), null));
t('a request needs a name', () => assert.equal(sanitizeRequest({ kind: 'access', name: '  ' }), null));
t('a request gets its deadline and a valid kind', () => {
  const r = sanitizeRequest({ kind: 'erasure', name: ' Ann ', email: 'ANN@Firm.LK', receivedOn: '2026-11-19' });
  assert.equal(r.kind, 'erasure');
  assert.equal(r.name, 'Ann');
  assert.equal(r.email, 'ann@firm.lk');
  assert.equal(r.dueOn, '2026-12-18');
  assert.equal(r.status, 'open');
});
t('an unknown kind becomes an access request, and a bad email is blanked', () => {
  const r = sanitizeRequest({ kind: 'delete everything', name: 'Ann', email: 'nope', receivedOn: '2026-11-19' });
  assert.equal(r.kind, 'access');
  assert.equal(r.email, '');
  assert.ok(REQUEST_KINDS.includes(r.kind));
});
t('a missing received date uses today', () => {
  const r = sanitizeRequest({ name: 'Ann' }, { today: '2026-11-19' });
  assert.equal(r.receivedOn, '2026-11-19');
});
t('state: open, due soon, overdue, done', () => {
  const r = { dueOn: '2026-12-18', status: 'open' };
  assert.equal(requestState(r, '2026-11-19'), 'open');
  assert.equal(requestState(r, '2026-12-15'), 'due_soon');
  assert.equal(requestState(r, '2026-12-19'), 'overdue');
  assert.equal(requestState({ ...r, status: 'done' }, '2027-01-05'), 'done');
});
t('attention list: overdue first, then due soon, earliest first', () => {
  const list = requestsNeedingAttention([
    { name: 'open', dueOn: '2026-12-30', status: 'open' },
    { name: 'late', dueOn: '2026-12-01', status: 'open' },
    { name: 'soon', dueOn: '2026-12-16', status: 'open' },
    { name: 'closed', dueOn: '2026-12-01', status: 'done' },
  ], '2026-12-15');
  assert.deepEqual(list.map((r) => r.name), ['late', 'soon', 'open', 'closed']);
});

// Customer CSV with custom fields
const defs = [{ key: 'vip', label: 'VIP', type: 'yesno' }, { key: 'budget', label: 'Budget', type: 'number' }];
t('custom value text: yes or no, blank when not set, plain otherwise', () => {
  assert.equal(customValueText('yesno', true), 'Yes');
  assert.equal(customValueText('yesno', false), 'No');
  assert.equal(customValueText('number', null), '');
  assert.equal(customValueText('text', 'abc'), 'abc');
});
t('CSV has base and custom columns, and a row per deal with its values', () => {
  const csv = customersCsv({ defs, deals: [{ name: 'Ann', email: 'ann@x.com', company: 'Acme, Ltd', stage: 'won', value: 500, currency: 'USD', customFields: { vip: true, budget: 900 } }] });
  const [head, row] = csv.trim().split('\r\n');
  assert.equal(head, 'Name,Email,Company,Stage,Value,Currency,VIP,Budget');
  assert.equal(row, 'Ann,ann@x.com,"Acme, Ltd",won,500,USD,Yes,900');
});
t('a customer with no deal keeps the values saved by email, after the deals', () => {
  const csv = customersCsv({ defs, deals: [], extraFields: { 'bob@x.com': { vip: false, budget: 40 } } });
  assert.equal(csv.trim().split('\r\n')[1], ',bob@x.com,,,,,No,40');
});
t('a formula-like name is neutralised, and CRLF ends the file', () => {
  const csv = customersCsv({ defs: [], deals: [{ name: '=cmd()', email: 'z@x.com' }] });
  assert.ok(csv.includes("'=cmd()"), 'formula prefixed');
  assert.ok(csv.endsWith('\r\n'));
});
t('deal values win over saved values when both exist', () => {
  const csv = customersCsv({ defs, deals: [{ email: 'ann@x.com', customFields: { budget: 1 } }], extraFields: { 'ann@x.com': { budget: 99 } } });
  assert.equal(csv.trim().split('\r\n')[1].split(',').pop(), '1');
  assert.equal(csv.trim().split('\r\n').length, 2, 'the same person is not listed twice');
});

// Spam complaints (Gmail and Yahoo: under 0.3%; aim 0.1%)
t('the limit and the aim are 0.3% and 0.1%', () => { assert.equal(COMPLAINT_LIMIT_PCT, 0.3); assert.equal(COMPLAINT_AIM_PCT, 0.1); });
t('under 100 delivered is too few to judge', () => assert.equal(complaintRateStatus({ delivered: 99, complaints: 0 }).status, 'too_few'));
t('0.1% or below is ok', () => assert.equal(complaintRateStatus({ delivered: 1000, complaints: 1 }).status, 'ok'));
t('above 0.1% but under 0.3% is watch', () => assert.equal(complaintRateStatus({ delivered: 1000, complaints: 2 }).status, 'watch'));
t('exactly 0.3% is over (the limit is reached, not passed)', () => {
  const r = complaintRateStatus({ delivered: 1000, complaints: 3 });
  assert.equal(r.status, 'over');
  assert.equal(r.ratePct, 0.3);
});
t('complaints above delivered, or negative, are invalid', () => {
  assert.equal(complaintRateStatus({ delivered: 10, complaints: 11 }).status, 'invalid');
  assert.equal(complaintRateStatus({ delivered: -1, complaints: 0 }).status, 'invalid');
  assert.equal(complaintRateStatus({ delivered: '', complaints: 0 }).status, 'invalid');
});

// Wiring
t('the data-requests page exists and is in the More menu and the app frame', () => {
  assert.ok(fs.existsSync(new URL('../app/data-requests/page.js', import.meta.url)));
  assert.ok(NAV_ITEMS.some((i) => i.href === '/data-requests' && i.group === 'More'));
  assert.ok(SHELL_ROUTES.includes('/data-requests'));
});
t('the customers page has the CSV download and imports the rule', () => {
  const src = read('app/customers/page.js');
  assert.ok(src.includes('Download customers (CSV)'));
  assert.ok(src.includes('customersCsv({ deals, extraFields, defs: fieldDefs })'));
  assert.ok(src.includes('lib/customers-csv.js'));
});
t('the account page shows the spam complaint check', () => {
  const src = read('app/account/page.js');
  assert.ok(src.includes('complaintRateStatus({ delivered: complaintDelivered, complaints: complaintCount })'));
  assert.ok(src.includes('aria-label="Spam complaints"'));
});
t('the data-requests page saves to the owner subcollection and uses the rule', () => {
  const src = read('app/data-requests/page.js');
  assert.ok(src.includes('"data_requests"'));
  assert.ok(src.includes('sanitizeRequest(form'));
});

console.log(`gap-close-340: ${n} checks passed`);
