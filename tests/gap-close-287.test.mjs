// Pass 287: autopilot does not email an invoice when the address bounced or the total is over the owner's limit.
// Held invoices stay open, get no reminders, and show on Today for the owner to send.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { invoiceHold } from '../lib/invoice-autosend.js';
import { sanitizeAutoSend } from '../lib/autosend.js';
import { buildTodayActions } from '../lib/today-actions.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('no limit and a good address: the invoice is emailed as before', () => {
  assert.equal(invoiceHold({ total: 90000, cap: null, blocked: false }), null);
  assert.equal(invoiceHold({ total: 90000 }), null);
});

t('over the owner limit: held', () => {
  assert.equal(invoiceHold({ total: 501, cap: 500 }), 'over_cap');
  assert.equal(invoiceHold({ total: 500, cap: 500 }), null, 'exactly at the limit is sent');
});

t('a bounced address (or a Lost deal) is held, even under the limit', () => {
  assert.equal(invoiceHold({ total: 10, cap: 500, blocked: true }), 'blocked');
  assert.equal(invoiceHold({ total: 10, blocked: true }), 'blocked');
});

t('the limit is a positive amount to the cent, or no limit at all', () => {
  assert.equal(sanitizeAutoSend({ autoInvoiceMax: '250.456' }).autoInvoiceMax, 250.46);
  assert.equal(sanitizeAutoSend({ autoInvoiceMax: null }).autoInvoiceMax, null);
  assert.equal(sanitizeAutoSend({ autoInvoiceMax: '' }).autoInvoiceMax, null);
  assert.equal(sanitizeAutoSend({ autoInvoiceMax: -5 }).autoInvoiceMax, null);
  assert.equal(sanitizeAutoSend({}).autoInvoiceMax, null);
});

t('held invoices show on Today first, with the right wording and link', () => {
  const items = buildTodayActions({ invoicesToApprove: 1 });
  assert.equal(items[0].key, 'invoicesToApprove');
  assert.equal(items[0].text, '1 invoice is held for you to send (over your limit, or the address bounced)');
  assert.equal(items[0].href, '/billing');
});

t('the daily job checks the consent and bounce rule and the limit before it emails, and skips held invoices in reminders', () => {
  const src = fs.readFileSync('lib/server/daily-ops.js', 'utf8');
  assert.ok(src.includes("isBlockedContact(db, uid, p.to, 'transactional')"));
  assert.ok(src.includes('cap: bs.autoInvoiceMax ?? null'));
  assert.ok(src.includes('invoices.filter((i) => !i.heldReason || i.emailedAt)'));
});

t('the Account page has the limit field, and it saves through the same autopilot save', () => {
  const src = fs.readFileSync('app/account/page.js', 'utf8');
  assert.ok(src.includes('saveAutopilot({ autoInvoiceMax: next })'));
});

console.log(`\n${n} passed`);
