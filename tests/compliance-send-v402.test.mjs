// v402: marketing email needs the owner's postal address on every send path, and the opt-out footer must carry the real link.
// Pure checks plus wiring checks (the send paths need Firestore and Gmail, which this test does not run). Run: node --test tests/compliance-send-v402.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { postalAddressProblem, withTextFooter } from '../lib/server/unsubscribe.js';
import { withOptOut } from '../lib/journey-send.js';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('postal address: blank, too short and no number are refused; a full address passes', () => {
  assert.ok(postalAddressProblem(''), 'blank');
  assert.ok(postalAddressProblem('10 High St'), 'too short');
  assert.ok(postalAddressProblem('High Street, London'), 'no building number');
  assert.equal(postalAddressProblem('10 High Street, London EC1A 1AA'), null);
});

// An object shaped like buildOptOut's result (the real one needs the signing secret).
const optOut = {
  pageUrl: 'https://app.example.com/unsubscribe?t=abc',
  oneClickUrl: 'https://app.example.com/api/unsubscribe?t=abc',
  textFooter: '\n\n--\n10 High Street, London EC1A 1AA\nNot interested? Opt out here and you won\'t hear from me again: https://app.example.com/unsubscribe?t=abc',
  headers: '',
};

test('the footer carries the postal address and the real opt-out link', () => {
  const out = withTextFooter('Hello', optOut);
  assert.match(out, /10 High Street, London EC1A 1AA/);
  assert.ok(out.includes(optOut.pageUrl));
  assert.ok(!out.includes('[object Object]'));
});

test('footer is not added twice when the body already has the link', () => {
  const body = `Hello\n\n${optOut.pageUrl}`;
  assert.equal(withTextFooter(body, optOut), body);
});

test('regression: passing the footer object to withOptOut is what printed [object Object]', () => {
  assert.match(withOptOut('Hello', optOut), /\[object Object\]/);
});

test('every marketing send path is wired to the postal-address check or the fixed footer', () => {
  const checks = [
    ['lib/server/customer-mail.js', 'postalAddressProblem(await getSenderAddress(db, uid))'],
    ['lib/server/autosend.js', 'postalAddressProblem(address)'],
    ['lib/server/broadcast.js', 'postalAddressProblem(await getSenderAddress(db, uid))'],
    ['app/api/send-new-leads/route.js', 'postalAddressProblem(senderAddress)'],
    ['lib/server/journey-send.js', 'withTextFooter(d.text, optOut)'],
    ['lib/server/broadcasts.js', 'withTextFooter(b.text, optOut)'],
  ];
  for (const [file, needle] of checks) assert.ok(read(file).includes(needle), `${file} must contain: ${needle}`);
  assert.ok(!read('lib/server/journey-send.js').includes('withOptOut(d.text, optOutFor'), 'journey path must not pass the footer object to withOptOut');
  assert.ok(!read('lib/server/broadcasts.js').includes('withOptOut(b.text, optOutFor'), 'broadcast path must not pass the footer object to withOptOut');
});
