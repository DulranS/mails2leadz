// Pass 367: a country code typed on Add a lead is kept on the deal (the same field an enquiry sets), and anything that is not two letters is ignored.
import assert from 'node:assert/strict';
import { buildDealWrite } from '../lib/deal-utils.js';
import { isOptInMarket } from '../lib/consent-rules.js';

const base = { uid: 'u1', email: 'buyer@example.com', stage: 'qualified', now: new Date('2026-11-23T00:00:00Z') };
assert.equal(buildDealWrite({ ...base, country: 'de' }).country, 'de', 'a two-letter code is kept in lower case');
assert.equal(buildDealWrite({ ...base, country: ' GB ' }).country, 'gb', 'spaces are trimmed');
assert.equal(buildDealWrite({ ...base, country: 'Sri Lanka' }).country, undefined, 'a name is not stored as a code');
assert.equal(buildDealWrite({ ...base, country: '' }).country, undefined, 'blank stores nothing');
assert.equal(buildDealWrite({ ...base }).country, undefined, 'omitted stores nothing');
// A country recorded on the deal is the one the consent rules read, so an EU buyer is caught even with a .com address.
assert.equal(isOptInMarket('buyer@example.com', 'de'), true, 'a DE code marks an EU market');
assert.equal(isOptInMarket('buyer@example.com', ''), false, 'no code and a .com address is not an opt-in market');
console.log('manual lead country: all checks pass');
