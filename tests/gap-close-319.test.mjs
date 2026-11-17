// Pass 319: CRM push. Deals go to the owner's HubSpot and/or Pipedrive as contacts, once a day, only when they changed.
// Pure builders are tested directly; the wiring (keys, catalog, daily job) is checked against the source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crmContactFromDeal, hubspotContactBody, pipedriveBaseUrl, pipedrivePersonBody, firstPipedriveMatch } from '../lib/crm.js';
import { CATALOG_NAMES } from '../lib/integration-catalog.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a deal with a usable email becomes a contact; the email is lower-cased and trimmed', () => {
  const c = crmContactFromDeal({ email: '  Ann.Lee@Acme.COM ', businessName: 'Acme   Ltd ' });
  assert.deepEqual(c, { email: 'ann.lee@acme.com', name: 'Acme Ltd', company: 'Acme Ltd' });
});

t('a deal with no usable email is not pushed', () => {
  assert.equal(crmContactFromDeal({ email: '', businessName: 'X' }), null);
  assert.equal(crmContactFromDeal({ email: 'not-an-email', businessName: 'X' }), null);
  assert.equal(crmContactFromDeal({}), null);
});

t('a long company name is cut to 120 characters', () => {
  const c = crmContactFromDeal({ email: 'a@b.co', businessName: 'x'.repeat(300) });
  assert.equal(c.name.length, 120);
});

t('with no company name, the email is used as the name', () => {
  assert.equal(crmContactFromDeal({ email: 'a@b.co' }).name, 'a@b.co');
});

t('HubSpot body: first word is the first name, the rest the last name, company when given', () => {
  const body = hubspotContactBody({ email: 'a@b.co', name: 'Ann van Dyk Ltd', company: 'Ann van Dyk Ltd' });
  assert.deepEqual(body, { properties: { email: 'a@b.co', firstname: 'Ann', lastname: 'van Dyk Ltd', company: 'Ann van Dyk Ltd' } });
});

t('HubSpot body: a single word has no last name', () => {
  const body = hubspotContactBody({ email: 'a@b.co', name: 'Acme', company: '' });
  assert.deepEqual(body, { properties: { email: 'a@b.co', firstname: 'Acme' } });
});

t('Pipedrive base URL accepts a bare company domain or a full pipedrive address', () => {
  assert.equal(pipedriveBaseUrl('acme'), 'https://acme.pipedrive.com/api/v2');
  assert.equal(pipedriveBaseUrl('https://Acme.pipedrive.com/'), 'https://acme.pipedrive.com/api/v2');
});

t('Pipedrive base URL refuses anything that is not a company domain', () => {
  assert.equal(pipedriveBaseUrl(''), null);
  assert.equal(pipedriveBaseUrl('a'), null);
  assert.equal(pipedriveBaseUrl('evil.com/x'), null);
  assert.equal(pipedriveBaseUrl('acme;rm'), null);
});

t('Pipedrive person: one work email marked primary', () => {
  const body = pipedrivePersonBody({ email: 'a@b.co', name: 'Acme' });
  assert.deepEqual(body, { name: 'Acme', emails: [{ value: 'a@b.co', primary: true, label: 'work' }] });
});

t('a Pipedrive search match is read from the v2 item shape; no match is null', () => {
  assert.equal(firstPipedriveMatch({ data: { items: [{ item: { id: 42 } }] } }), '42');
  assert.equal(firstPipedriveMatch({ data: { items: [] } }), null);
  assert.equal(firstPipedriveMatch(null), null);
});

t('the CRM keys are on the Integrations screen', () => {
  for (const k of ['HUBSPOT_PRIVATE_APP_TOKEN', 'PIPEDRIVE_COMPANY_DOMAIN', 'PIPEDRIVE_API_TOKEN']) {
    assert.ok(CATALOG_NAMES.includes(k), `${k} has no place on the screen`);
  }
});

t('the CRM keys are stored only through the encrypted account store', () => {
  const store = fs.readFileSync('lib/server/integration-secrets.js', 'utf8');
  assert.match(store, /export const CRM_NAMES = \[/);
  assert.match(store, /\.\.\.CRM_NAMES/);
});

t('the daily job pushes deals to the CRM after the integration check', () => {
  const daily = fs.readFileSync('lib/server/daily-ops.js', 'utf8');
  const check = daily.indexOf('await checkIntegrations(');
  const push = daily.indexOf('await pushDealsToCrm(');
  assert.ok(check > 0 && push > check, 'pushDealsToCrm must run after checkIntegrations');
});

t('the CRM run is idempotent: it looks up before it creates, and marks progress only for what it sent', () => {
  const crm = fs.readFileSync('lib/server/crm.js', 'utf8');
  assert.match(crm, /if \(found\.ok\) return String/);
  assert.match(crm, /firstPipedriveMatch\(/);
  assert.match(crm, /if \(!e\.permanent\) \{ transientStop = true; break; \}/);
});

console.log(`\n${n} passed`);
