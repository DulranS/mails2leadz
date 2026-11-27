// v405: companies grouped from people by email domain (lib/companies.js). Pure. Run: node --test tests/companies-v405.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companyDomainOf, cleanCompanyDomain, normaliseWebsite, sanitizeCompanyOverride, groupCompanies } from '../lib/companies.js';

test('a free email provider never makes a company', () => {
  assert.equal(companyDomainOf('ann@gmail.com'), '');
  assert.equal(companyDomainOf('ann@Outlook.com'), '');
  const out = groupCompanies({ contacts: [{ email: 'ann@gmail.com' }, { email: 'bob@gmail.com' }], deals: [{ email: 'cy@yahoo.com' }] });
  assert.deepEqual(out, []);
});

test('a malformed address makes no company', () => {
  assert.equal(companyDomainOf('no-at-sign'), '');
  assert.equal(companyDomainOf('ann@localhost'), '');
  assert.equal(companyDomainOf(''), '');
});

test('two people on one domain make one company, with the domain as its name', () => {
  const out = groupCompanies({ contacts: [{ email: 'ann@acme.lk' }, { email: 'Bob@ACME.lk' }] });
  assert.equal(out.length, 1);
  assert.equal(out[0].domain, 'acme.lk');
  assert.equal(out[0].name, 'acme.lk');
  assert.equal(out[0].website, 'https://acme.lk');
  assert.equal(out[0].notes, '');
  assert.equal(out[0].contactCount, 2);
});

test('the owner name overrides the domain as the company name', () => {
  const out = groupCompanies({ contacts: [{ email: 'ann@acme.lk' }], overrides: { 'acme.lk': { name: '  Acme Pvt Ltd  ', website: 'acme.lk', notes: 'Met at expo' } } });
  assert.equal(out[0].name, 'Acme Pvt Ltd');
  assert.equal(out[0].website, 'https://acme.lk');
  assert.equal(out[0].notes, 'Met at expo');
});

test('a blank override name falls back to the domain', () => {
  const out = groupCompanies({ contacts: [{ email: 'ann@acme.lk' }], overrides: { 'acme.lk': { name: '   ' } } });
  assert.equal(out[0].name, 'acme.lk');
});

test('contact count is distinct people; deal count is deals', () => {
  const out = groupCompanies({
    contacts: [{ email: 'ann@acme.lk' }, { email: 'ann@acme.lk' }, { email: 'bob@acme.lk' }],
    deals: [{ email: 'ann@acme.lk' }, { email: 'ann@acme.lk' }, { email: 'cy@acme.lk' }],
  });
  assert.equal(out[0].contactCount, 3); // ann, bob, cy
  assert.equal(out[0].dealCount, 3);
});

test('a person on a contact and on a deal is one contact', () => {
  const out = groupCompanies({ contacts: [{ email: 'ann@acme.lk' }], deals: [{ email: 'ann@acme.lk' }] });
  assert.equal(out[0].contactCount, 1);
  assert.equal(out[0].dealCount, 1);
});

test('deals with no email, or with a free provider, do not count toward a company', () => {
  const out = groupCompanies({ contacts: [{ email: 'ann@acme.lk' }], deals: [{ email: '' }, {}, { email: 'x@gmail.com' }] });
  assert.equal(out[0].dealCount, 0);
  assert.equal(out.length, 1);
});

test('an override on a domain with no people is ignored: no company appears', () => {
  assert.deepEqual(groupCompanies({ contacts: [], overrides: { 'ghost.lk': { name: 'Ghost' } } }), []);
});

test('an invalid stored website falls back to the domain', () => {
  const out = groupCompanies({ contacts: [{ email: 'ann@acme.lk' }], overrides: { 'acme.lk': { website: 'javascript:alert(1)' } } });
  assert.equal(out[0].website, 'https://acme.lk');
});

test('companies sort by name, not by domain', () => {
  const out = groupCompanies({ contacts: [{ email: 'a@zeta.lk' }, { email: 'b@alpha.lk' }], overrides: { 'zeta.lk': { name: 'Aardvark Co' } } });
  assert.deepEqual(out.map((c) => c.domain), ['zeta.lk', 'alpha.lk']);
});

test('the domain must be well formed and not a free provider when saved', () => {
  assert.equal(cleanCompanyDomain(' Acme.LK '), 'acme.lk');
  assert.equal(cleanCompanyDomain('gmail.com'), '');
  assert.equal(cleanCompanyDomain('acme'), '');
  assert.equal(cleanCompanyDomain('acme.lk/../x'), '');
});

test('websites: https is added, a bare word is refused, other schemes are refused', () => {
  assert.equal(normaliseWebsite('acme.lk'), 'https://acme.lk');
  assert.equal(normaliseWebsite('https://acme.lk/'), 'https://acme.lk');
  assert.equal(normaliseWebsite(''), '');
  assert.equal(normaliseWebsite('localhost'), null);
  assert.equal(normaliseWebsite('ftp://acme.lk'), null);
});

test('saving an override cleans the fields and refuses a bad website', () => {
  const ok = sanitizeCompanyOverride({ name: 'A\u0001cme', website: 'acme.lk', notes: 'line one\nline two' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.name, 'A cme');
  assert.equal(ok.value.notes, 'line one\nline two');
  const bad = sanitizeCompanyOverride({ website: 'not a site' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /website/);
});

console.log('companies-v405 tests passed');
