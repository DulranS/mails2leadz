// Pass 338: the implementable gaps closed in code (customer fields, sales figures on the chosen window, the orders screen,
// the WhatsApp consent purpose). Run: node tests/gap-close-338.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeDefinitions, sanitizeValue, sanitizeCustomValues, customFieldRows, CUSTOM_FIELD_TYPES, MAX_CUSTOM_FIELDS } from '../lib/custom-fields.js';
import { buildDealWrite } from '../lib/deal-utils.js';
import { salesKpis } from '../lib/sales-kpis.js';
import { orderRows } from '../lib/orders.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000;
const NOW = Date.parse('2026-11-18T00:00:00Z');

t('definitions: keys come from labels, repeats get a suffix, bad rows are dropped', () => {
  const defs = sanitizeDefinitions([
    { label: 'Renewal month', type: 'date' },
    { label: 'Renewal month', type: 'text' },
    { label: '  ', type: 'text' },
    { label: 'Tier', type: 'choice' },
    { label: 'ප්‍රදේශය', type: 'text' },
    { label: '2025 target', type: 'number' },
  ]);
  assert.deepEqual(defs.map((d) => d.key), ['renewal_month', 'renewal_month_2', 'field_3', 'f_2025_target']);
  assert.deepEqual(defs[0], { key: 'renewal_month', label: 'Renewal month', type: 'date' });
});

t('definitions: at most 10 fields, and the four types are the only ones', () => {
  const many = Array.from({ length: 14 }, (_, i) => ({ label: `Field ${i}`, type: 'text' }));
  assert.equal(sanitizeDefinitions(many).length, MAX_CUSTOM_FIELDS);
  assert.equal(MAX_CUSTOM_FIELDS, 10);
  assert.deepEqual(CUSTOM_FIELD_TYPES, ['text', 'number', 'date', 'yesno']);
});

t('values: each type is checked, and empty values are left out', () => {
  assert.equal(sanitizeValue('number', '1,250.456'), 1250.46);
  assert.equal(sanitizeValue('number', 'abc'), null);
  assert.equal(sanitizeValue('date', '2026-11-18'), '2026-11-18');
  assert.equal(sanitizeValue('date', '2026-02-31'), null);
  assert.equal(sanitizeValue('yesno', 'yes'), true);
  assert.equal(sanitizeValue('yesno', 'no'), false);
  assert.equal(sanitizeValue('yesno', 'maybe'), null);
  assert.equal(sanitizeValue('text', '  hi\u0000there  '), 'hi there');
  assert.equal(sanitizeValue('text', ''), null);
  assert.equal(sanitizeValue('text', 'x'.repeat(300)).length, 200);
});

t('stored values keep only defined keys when definitions are given, each type checked', () => {
  const defs = sanitizeDefinitions([{ label: 'Tier', type: 'text' }, { label: 'Renewal', type: 'date' }]);
  assert.deepEqual(sanitizeCustomValues({ tier: 'Gold', renewal: '2026-13-01', other: 'x' }, defs), { tier: 'Gold' });
});

t('without definitions (the deal write), only well-formed keys are kept, by what each value is', () => {
  assert.deepEqual(sanitizeCustomValues({ tier: 'Gold', 'Bad Key': 'x', count: '7', flag: true, empty: '' }), { tier: 'Gold', count: '7', flag: true });
  assert.deepEqual(sanitizeCustomValues(null), {});
  assert.deepEqual(sanitizeCustomValues(['a']), {});
});

t('the editor rows carry each value, or null when it is not set', () => {
  const rows = customFieldRows([{ label: 'Tier', type: 'text' }, { label: 'Renewal', type: 'date' }], { tier: 'Gold' });
  assert.deepEqual(rows.map((r) => [r.key, r.value]), [['tier', 'Gold'], ['renewal', null]]);
});

t('the deal write keeps the cleaned custom values, and leaves them alone when not passed', () => {
  const base = { uid: 'u1', email: 'a@x.com', stage: 'new', now: new Date(NOW) };
  assert.deepEqual(buildDealWrite({ ...base, customFields: { tier: 'Gold', 'Bad Key': 1 } }).customFields, { tier: 'Gold' });
  assert.equal('customFields' in buildDealWrite(base), false);
});

const deal = (days, value = 100) => ({ stage: 'closed_won', value, stageTimes: { closed_won: new Date(NOW - days * DAY).toISOString() } });

t('sales figures: with no window they count the last 365 days, as before', () => {
  const k = salesKpis({ deals: [deal(30), deal(300), deal(400)], now: NOW });
  assert.equal(k.sales.wonLast12Months, 2);
  assert.equal(k.sales.windowLabel, 'last 12 months');
});

t('sales figures: a chosen window counts only wins inside it, with its end left out', () => {
  const deals = [deal(3), deal(10), deal(40), deal(70)];
  const k = salesKpis({ deals, now: NOW, windowStart: NOW - 50 * DAY, windowEnd: NOW - 5 * DAY, windowLabel: '2026-09-29 to 2026-11-13' });
  assert.equal(k.sales.wonLast12Months, 2); // the 10-day and 40-day wins; the 3-day win is after the end, the 70-day win before the start
  assert.equal(k.sales.wonValueLast12Months, 200);
  assert.equal(k.sales.windowLabel, '2026-09-29 to 2026-11-13');
});

const order = (id, total, at) => ({ id, quoteId: id, total, customerName: 'Ann', customerEmail: 'ann@x.com', title: `T${id}`, currency: 'LKR', confirmedAt: at });

t('orders: newest first, status from the invoices, counts, and value not yet paid', () => {
  const orders = [order('o1', 100, '2026-11-01T00:00:00Z'), order('o2', 200, '2026-11-10T00:00:00Z'), order('o3', 50, '2026-11-05T00:00:00Z')];
  const invoices = [
    { quoteId: 'o1', status: 'paid', amountPaid: 100, total: 100 },
    { quoteId: 'o3', status: 'sent', amountPaid: 0, total: 50 },
  ];
  const r = orderRows(orders, invoices);
  assert.deepEqual(r.rows.map((x) => x.id), ['o2', 'o3', 'o1']);
  assert.deepEqual(r.rows.map((x) => x.status), ['confirmed', 'invoiced', 'paid']);
  assert.deepEqual(r.counts, { confirmed: 1, invoiced: 1, paid: 1 });
  assert.equal(r.openValue, 250);
});

t('orders: empty or missing input is an empty list, and a row with no id is skipped', () => {
  assert.deepEqual(orderRows(), { rows: [], counts: { confirmed: 0, invoiced: 0, paid: 0 }, openValue: 0 });
  assert.equal(orderRows([{ total: 5 }]).rows.length, 0);
});

t('the WhatsApp consent route records a purpose, and says not_stated when none is given', () => {
  const src = fs.readFileSync('app/api/whatsapp/consent/route.js', 'utf8');
  assert.match(src, /const PURPOSES = \['replies_and_updates', 'marketing'\];/);
  assert.match(src, /'not_stated'/);
  assert.match(src, /consent, purpose, recordedAt/);
});

t('the integrations form sends the chosen purpose', () => {
  const src = fs.readFileSync('app/integrations/page.js', 'utf8');
  assert.match(src, /consent: consent\.agreed, purpose: consent\.purpose/);
});

t('Orders is in the menu and in the shell routes', () => {
  const src = fs.readFileSync('lib/app-routes.js', 'utf8');
  assert.match(src, /href: '\/orders', icon: '📦', label: 'Orders', group: 'Sell'/);
  assert.match(src, /'\/history', '\/orders', '\/candidates'(, '\/data-requests')?(, '\/breaches')?\];/);
});

t('the orders page reads the owner\'s orders and the invoices, then shows orderRows', () => {
  const src = fs.readFileSync('app/orders/page.js', 'utf8');
  assert.match(src, /collection\(db, "users", user\.uid, "orders"\)/);
  assert.match(src, /where\("userId", "==", user\.uid\)/);
  assert.match(src, /orderRows\(orders, invoices\)/);
});

t('the KPI route passes its window to the sales figures', () => {
  const src = fs.readFileSync('app/api/kpis/route.js', 'utf8');
  assert.match(src, /salesKpis\(\{ deals, leads, targets, tickets: support\.tickets, \.\.\.salesWindow \}\)/);
  assert.match(src, /windowStart: range\.start, windowEnd: range\.end/);
});

t('the customers page loads the field list and shows each customer\'s values in the expanded row', () => {
  const src = fs.readFileSync('app/customers/page.js', 'utf8');
  assert.match(src, /getSettingsDoc\(db, user\.uid, "custom_fields"\)/);
  assert.match(src, /<CustomFieldValues key=\{c\.email\}/);
  assert.match(src, /<CustomFieldsEditor db=\{db\}/);
  assert.match(fs.readFileSync('lib/deal-utils.js', 'utf8'), /if \(customFields !== undefined\) write\.customFields = sanitizeCustomValues\(customFields\);/);
});

{
  const { isOptInMarket, contactBasisFor } = await import('../lib/consent-rules.js');
  const checks = [
    () => assert.equal(isOptInMarket('buyer@shop.co.uk'), true),
    () => assert.equal(isOptInMarket('buyer@firm.de'), true),
    () => assert.equal(isOptInMarket('buyer@firm.eu'), true),
    () => assert.equal(isOptInMarket('buyer@firm.lk'), true), // pass 340: .lk added (PDPA 2022 s.27)
    () => assert.equal(isOptInMarket('buyer@firm.com'), false),
    () => assert.equal(contactBasisFor({ email: 'buyer@firm.de' }).marketingAllowed, false),
    () => assert.equal(contactBasisFor({ email: 'buyer@firm.de', marketingConsent: true, consentSource: 'web form' }).marketingAllowed, true),
    () => assert.equal(contactBasisFor({ email: 'buyer@firm.lk' }).marketingAllowed, false), // pass 340
    () => assert.equal(contactBasisFor({ email: 'buyer@gmail.com' }).marketingAllowed, false),
  ];
  for (const c of checks) { c(); n++; }
  console.log('  ok - EU and UK addresses need consent for marketing; other business addresses do not');
}

{
  const src = fs.readFileSync('lib/server/whatsapp.js', 'utf8');
  assert.match(src, /export const WA_KIND_PURPOSE = \{ quote: 'replies_and_updates', invoice: 'replies_and_updates', followup: 'marketing' \};/);
  assert.match(fs.readFileSync('app/api/whatsapp/send/route.js', 'utf8'), /kind, \/\/ the purpose the customer agreed to must cover this kind of message/);
  n++;
  console.log('  ok - a WhatsApp follow-up needs marketing consent; quotes and invoices need replies consent');
}

{
  const { addMonthsIso, sanitizeCandidate, retentionDue, candidateStageLabel, CANDIDATE_STAGES } = await import('../lib/candidates.js');
  const checks = [
    () => assert.equal(addMonthsIso('2026-01-31T00:00:00.000Z', 1), '2026-02-28T00:00:00.000Z'),
    () => assert.equal(addMonthsIso('2026-01-31T00:00:00.000Z', 12), '2027-01-31T00:00:00.000Z'),
    () => assert.equal(addMonthsIso('not a date', 12), null),
    () => assert.equal(sanitizeCandidate({ name: '   ' }), null),
    () => assert.equal(sanitizeCandidate({ name: 'Ann', email: 'ann@@x' }).email, ''),
    () => assert.equal(sanitizeCandidate({ name: 'Ann', email: ' Ann@X.com ' }).email, 'ann@x.com'),
    () => assert.equal(sanitizeCandidate({ name: 'Ann', stage: 'hired' }).stage, 'new'),
    () => assert.equal(sanitizeCandidate({ name: 'Ann', consentToContact: true }).consentAt !== null, true),
    () => assert.equal(sanitizeCandidate({ name: 'Ann', consentToContact: false }).consentAt, null),
    () => assert.equal(sanitizeCandidate({ name: 'Ann' }, { now: new Date('2026-01-01T00:00:00Z') }).retainUntil, '2027-01-01T00:00:00.000Z'),
    () => assert.equal(sanitizeCandidate({ name: 'Ann', notes: 'x'.repeat(1500) }).notes.length, 1000),
    () => assert.deepEqual(retentionDue([
      { name: 'b', retainUntil: '2026-06-01T00:00:00.000Z' },
      { name: 'c', retainUntil: '2027-06-01T00:00:00.000Z' },
      { name: 'a', retainUntil: '2026-01-01T00:00:00.000Z' },
    ], new Date('2026-11-18T00:00:00Z')).map((r) => r.name), ['a', 'b']),
    () => assert.equal(candidateStageLabel('placed'), 'Placed'),
    () => assert.equal(candidateStageLabel('nope'), 'New'),
    () => assert.equal(CANDIDATE_STAGES.length, 7),
  ];
  for (const c of checks) { c(); n++; }
  console.log('  ok - candidate profiles: retention dates, cleaning, consent and stage rules');
}

{
  const nav = fs.readFileSync('lib/app-routes.js', 'utf8');
  assert.match(nav, /href: '\/candidates', icon: '🎯', label: 'Candidates', group: 'More'/);
  assert.match(nav, /'\/orders', '\/candidates'(, '\/data-requests')?(, '\/breaches')?\];/);
  const dc = fs.readFileSync('lib/deal-client.js', 'utf8');
  assert.match(dc, /const \{ customFields, \.\.\.rest \} = write;/);
  assert.match(dc, /if \(customFields !== undefined\) await updateDoc\(ref, \{ customFields \}\);/);
  const cf = fs.readFileSync('app/components/CustomFields.js', 'utf8');
  assert.match(cf, /"customer_fields", dealDocId\(uid, email\)/);
  const cp = fs.readFileSync('app/customers/page.js', 'utf8');
  assert.match(cp, /collection\(db, "users", user\.uid, "customer_fields"\)/);
  n++;
  console.log('  ok - candidates in the menu; custom values replaced, not merged; no-deal customers keep their values');
}

console.log(`gap closes 338: ${n} checks passed`);
