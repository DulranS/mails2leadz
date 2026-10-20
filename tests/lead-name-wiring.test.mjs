// A phone number must not survive as a business name at ANY entry point or in any number the screens read.
import assert from 'node:assert/strict';
import { sanitizeLead } from '../lib/lead-inbox.js';
import { mapImportRows } from '../lib/lead-import.js';
import { candidateFromElement } from '../lib/lead-finder.js';
import { buildDealWrite, dealDocId } from '../lib/deal-utils.js';
import { computeBusinessMetrics } from '../lib/business-metrics.js';
import { computeCustomers } from '../lib/customers.js';
import { computeRecurring } from '../lib/recurring.js';
import { computeBilling } from '../lib/billing.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.UTC(2026, 9, 20, 12);
const ago = (d) => new Date(NOW - d * 86400000).toISOString();

t('lead inbox: a phone number in the name is replaced from the website or e-mail, and refused when nothing honest exists', () => {
  const a = sanitizeLead({ business_name: '0771234567', website: 'https://www.acme-plumbing.lk', whatsapp_number: '94771234567' });
  assert.equal(a.ok, true); assert.equal(a.lead.business_name, 'Acme Plumbing');
  const b = sanitizeLead({ business_name: '+94 77 123 4567', email: 'info@ceyloncold.lk' });
  assert.equal(b.ok, true); assert.equal(b.lead.business_name, 'Ceyloncold');
  assert.deepEqual(sanitizeLead({ business_name: '0771234567', whatsapp_number: '94771234567' }), { ok: false, reason: 'invalid' });
  assert.equal(sanitizeLead({ business_name: 'Real Name', whatsapp_number: '94771234567' }).lead.business_name, 'Real Name');
  assert.equal(sanitizeLead({ business_name: '24/7 Plumbing', whatsapp_number: '94771234567' }).lead.business_name, '24/7 Plumbing');
});

t('list import: a phone number in the name column is replaced by the website name, else the row counts as nameless', () => {
  const { candidates, stats } = mapImportRows([
    { title: '0771234567', website: 'https://perera-hardware.lk', phone: '0112223333' },
    { title: '+94 11 234 5678', phone: '0112223333', website: '' },
    { title: 'Real Co', phone: '0771112222' },
  ], { label: 'x' });
  assert.deepEqual(candidates.map((c) => c.business_name).sort(), ['Perera Hardware', 'Real Co']);
  assert.equal(stats.noName, 1);
});

t('map finder: a place whose name tag is a phone number uses the next real tag, or is skipped', () => {
  const ok = candidateFromElement({ type: 'node', id: 1, tags: { name: '0771234567', brand: 'Ceylon Cold Stores', phone: '+94112345678' } });
  assert.equal(ok.candidate.business_name, 'Ceylon Cold Stores');
  const viaSite = candidateFromElement({ type: 'node', id: 2, tags: { name: '0771234567', website: 'https://acme-plumbing.lk', phone: '+94112345678' } });
  assert.equal(viaSite.candidate.business_name, 'Acme Plumbing');
  assert.deepEqual(candidateFromElement({ type: 'node', id: 3, tags: { name: '0771234567', phone: '+94112345678' } }), { skip: 'no_name' });
  assert.deepEqual(candidateFromElement({ type: 'node', id: 4, tags: { website: 'https://acme.lk' } }), { skip: 'no_name' }); // truly nameless: still skipped
});

t('deal writes never store a phone number as the name, and a real name still saves', () => {
  const base = { uid: 'u', email: 'a@b.co', stage: 'contacted' };
  assert.equal('businessName' in buildDealWrite({ ...base, businessName: '0771234567' }), false);
  assert.equal(buildDealWrite({ ...base, businessName: 'Acme' }).businessName, 'Acme');
  assert.equal(dealDocId('u', 'a@b.co').length > 0, true);
});

t('numbers on every screen: a deal or invoice that already holds a phone number shows the e-mail domain name, or nothing (screens fall back to the e-mail)', () => {
  const deal = { email: 'sales@perera-hardware.lk', stage: 'closed_won', value: 900, businessName: '0771234567', createdAt: ago(40), closedAt: ago(10), lastUpdate: ago(5), recurringMonthly: 100 };
  const free = { email: 'owner@gmail.com', stage: 'closed_won', value: 500, businessName: '+94 77 123 4567', createdAt: ago(40), closedAt: ago(10), lastUpdate: ago(5), recurringMonthly: 50 };
  const m = computeBusinessMetrics({ deals: [deal, free], now: NOW });
  const names = Object.fromEntries(m.deals.map((d) => [d.email, d.businessName]));
  assert.equal(names['sales@perera-hardware.lk'], 'Perera Hardware');
  assert.equal(names['owner@gmail.com'], ''); // empty -> screens print the e-mail, never the number
  const c = computeCustomers({ deals: [deal, free], invoices: [], now: NOW });
  assert.ok(c.customers.every((x) => !/^\+?[\d\s]+$/.test(x.businessName)));
  const r = computeRecurring({ deals: [deal, free], now: NOW });
  assert.ok(JSON.stringify(r).indexOf('0771234567') === -1);
  const b = computeBilling({ invoices: [{ email: 'owner@gmail.com', amount: 10, status: 'open', businessName: '0771234567', issuedAt: ago(3), dueAt: ago(-10) }], now: NOW });
  assert.equal(b.rows[0].businessName, '');
});

console.log(`\n${n} lead-name-wiring tests ok`);
