// Pass 321: deal amounts go to the CRM (HubSpot amount, Pipedrive value and currency) on create, and again when they change.
// The rules are pure (lib/crm.js) and tested here; the calls and the per-deal loop are checked against lib/server/crm.js source.
// Field names are verified against the vendor docs: HubSpot deal "amount" (string); Pipedrive v2 POST and PATCH /deals take value and currency.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  dealAmount, dealCurrency, amountDue, hubspotAmountBody, pipedriveAmountBody,
  hubspotDealBody, pipedriveDealBody,
} from '../lib/crm.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a deal value becomes a money amount to 2 decimals; no value, zero, or a negative value sends nothing', () => {
  assert.equal(dealAmount({ value: 1500.456 }), 1500.46);
  assert.equal(dealAmount({ value: '250' }), 250);
  assert.equal(dealAmount({ value: 0 }), null);
  assert.equal(dealAmount({ value: -5 }), null);
  assert.equal(dealAmount({ value: 'abc' }), null);
  assert.equal(dealAmount({}), null);
});

t('a currency is sent only when it is a 3-letter code', () => {
  assert.equal(dealCurrency({ currency: ' usd ' }), 'USD');
  assert.equal(dealCurrency({ currency: 'dollars' }), null);
  assert.equal(dealCurrency({}), null);
});

t('an amount is due when we have one and it differs from what we last sent to that CRM', () => {
  assert.equal(amountDue(1500, undefined), true);   // never sent
  assert.equal(amountDue(1500, 1200), true);        // changed
  assert.equal(amountDue(1500, 1500), false);       // unchanged: no call
  assert.equal(amountDue(null, undefined), false);  // no value: nothing to send
  assert.equal(amountDue(null, 1500), false);       // a cleared value is not sent (the CRM keeps its last amount)
});

t('HubSpot amount is a string with 2 decimals, the property named amount', () => {
  assert.deepEqual(hubspotAmountBody(10.5), { properties: { amount: '10.50' } });
  assert.deepEqual(hubspotAmountBody(1500), { properties: { amount: '1500.00' } });
});

t('HubSpot deal create carries the amount only when there is one', () => {
  const withAmount = hubspotDealBody({ title: 'Acme', contactId: '201', outcome: 'open', amount: 1500 });
  assert.equal(withAmount.properties.amount, '1500.00');
  const without = hubspotDealBody({ title: 'Acme', contactId: '201', outcome: 'open' });
  assert.equal('amount' in without.properties, false);
  assert.equal('amount' in hubspotDealBody({ title: 'A', contactId: '1', outcome: 'open', amount: null }).properties, false);
});

t('Pipedrive deal create carries value (and currency when known), and nothing extra when there is no amount', () => {
  assert.deepEqual(pipedriveDealBody({ title: 'Acme', personId: '123', amount: 1500, currency: 'USD' }), { title: 'Acme', person_id: 123, value: 1500, currency: 'USD' });
  assert.deepEqual(pipedriveDealBody({ title: 'Acme', personId: '123', amount: 1500 }), { title: 'Acme', person_id: 123, value: 1500 });
  assert.deepEqual(pipedriveDealBody({ title: 'Acme', personId: '123' }), { title: 'Acme', person_id: 123 });
});

t('Pipedrive amount change is a PATCH body of value, with currency when there is one', () => {
  assert.deepEqual(pipedriveAmountBody({ amount: 900, currency: 'EUR' }), { value: 900, currency: 'EUR' });
  assert.deepEqual(pipedriveAmountBody({ amount: 900, currency: null }), { value: 900 });
});

// ---- the calls and the loop: checked against the source (they need the Firebase packages to run) ----
const crm = fs.readFileSync('lib/server/crm.js', 'utf8');

t('both CRM adapters can change a deal amount, and the loop sends it when it is due', () => {
  assert.match(crm, /async setAmount\(id, amount\)/);
  assert.match(crm, /async setAmount\(id, amount, currency\)/);
  assert.match(crm, /hubspotAmountBody\(amount\)/);
  assert.match(crm, /pipedriveAmountBody\(\{ amount, currency \}\)/);
  assert.match(crm, /if \(amountDue\(amount, amounts\[provider\]\)\) \{\s*await adapter\.setAmount\(linkId, amount, currency\);/);
});

t('the amount sent to each CRM is recorded on the deal, so an unchanged amount is not sent again', () => {
  assert.match(crm, /const amounts = \{ \.\.\.\(d\.crmAmounts \|\| \{\}\) \}/);
  assert.match(crm, /crmAmounts: amounts/);
  assert.match(crm, /if \(amount !== null\) amounts\[provider\] = amount;/);
});

t('a create sends the amount with the deal, and the amount never comes back from the CRM (no read of value)', () => {
  assert.match(crm, /outcome: dec\.outcome, amount, currency \}\)/);
  assert.doesNotMatch(crm, /\?\.data\?\.value|\.properties\?\.amount|properties\.amount\)/);
});

console.log(`\n${n} passed`);
