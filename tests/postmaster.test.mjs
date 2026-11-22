// Postmaster spam rate (lib/postmaster.js) and the Gmail consent scopes (lib/gmail-scopes.js). Pure. Run: node --test tests/postmaster.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDomain, toDateParts, spamRateRequest, readSpamRate, summariseSpamRate, POSTMASTER_API, SPAM_RATE_NAME } from '../lib/postmaster.js';
import { consentScopes, grantedScopes, OFFLINE_SCOPE, SEND_SCOPE, POSTMASTER_SCOPE } from '../lib/gmail-scopes.js';

test('a domain is taken from what the owner typed, or refused', () => {
  assert.equal(cleanDomain('Example.com'), 'example.com');
  assert.equal(cleanDomain('https://Shop.Example.com/path?x=1'), 'shop.example.com');
  assert.equal(cleanDomain('me@example.co.uk'), 'example.co.uk');
  assert.equal(cleanDomain('example.com:8080'), 'example.com');
  assert.equal(cleanDomain('localhost'), null);
  assert.equal(cleanDomain('bad domain.com'), null);
  assert.equal(cleanDomain(''), null);
  assert.equal(cleanDomain(undefined), null);
});

test('dates must be real calendar dates in YYYY-MM-DD form', () => {
  assert.deepEqual(toDateParts('2026-11-01'), { year: 2026, month: 11, day: 1 });
  assert.equal(toDateParts('2026-02-30'), null, 'no 30 February');
  assert.equal(toDateParts('2026-13-01'), null);
  assert.equal(toDateParts('01/11/2026'), null);
  assert.equal(toDateParts(null), null);
});

test('the request goes to the v2 domain stats query for SPAM_RATE, daily, inclusive dates', () => {
  const r = spamRateRequest({ domain: 'example.com', from: '2026-11-01', to: '2026-11-21' });
  assert.equal(r.url, `${POSTMASTER_API}/domains/example.com/domainStats:query`);
  assert.equal(r.url, 'https://gmailpostmastertools.googleapis.com/v2/domains/example.com/domainStats:query');
  assert.deepEqual(r.body.timeQuery, { dateRanges: { dateRanges: [{ start: { year: 2026, month: 11, day: 1 }, end: { year: 2026, month: 11, day: 21 } }] } });
  assert.deepEqual(r.body.metricDefinitions, [{ name: SPAM_RATE_NAME, baseMetric: { standardMetric: 'SPAM_RATE' } }]);
  assert.equal(r.body.aggregationGranularity, 'DAILY');
  assert.equal(r.domain, 'example.com');
});

test('a bad domain, bad dates or a reversed range make no request', () => {
  assert.equal(spamRateRequest({ domain: 'nope', from: '2026-11-01', to: '2026-11-21' }), null);
  assert.equal(spamRateRequest({ domain: 'example.com', from: '2026-11-21', to: '2026-11-01' }), null, 'start after end');
  assert.equal(spamRateRequest({ domain: 'example.com', from: 'yesterday', to: '2026-11-21' }), null);
  assert.equal(spamRateRequest({}), null);
});

test('only SPAM_RATE values are read, numbers come from any value field, and they sort oldest first', () => {
  const json = {
    domainStats: [
      { metric: SPAM_RATE_NAME, date: { year: 2026, month: 11, day: 3 }, value: { doubleValue: 0.0012 } },
      { metric: SPAM_RATE_NAME, date: { year: 2026, month: 11, day: 1 }, value: { floatValue: 0.0008 } },
      { metric: SPAM_RATE_NAME, date: { year: 2026, month: 11, day: 2 }, value: { intValue: '0' } },
      { metric: SPAM_RATE_NAME, date: { year: 2026, month: 11, day: 4 }, value: { stringValue: '0.002' } },
      { metric: SPAM_RATE_NAME, date: { year: 2026, month: 11, day: 5 }, value: { stringValue: 'n/a' } },
      { metric: 'other_metric', date: { year: 2026, month: 11, day: 6 }, value: { doubleValue: 9 } },
      { metric: SPAM_RATE_NAME, date: { year: 2026, month: 11, day: 7 }, value: {} },
    ],
  };
  const rows = readSpamRate(json);
  assert.deepEqual(rows, [
    { date: '2026-11-01', value: 0.0008 },
    { date: '2026-11-02', value: 0 },
    { date: '2026-11-03', value: 0.0012 },
    { date: '2026-11-04', value: 0.002 },
  ]);
});

test('an empty or malformed response reads as no rows, and a summary is null', () => {
  assert.deepEqual(readSpamRate({}), []);
  assert.deepEqual(readSpamRate(null), []);
  assert.equal(summariseSpamRate([]), null);
});

test('the summary gives the latest day and the average, with the values as Google returns them', () => {
  const s = summariseSpamRate([{ date: '2026-11-01', value: 0.001 }, { date: '2026-11-02', value: 0.003 }]);
  assert.equal(s.days, 2);
  assert.deepEqual(s.latest, { date: '2026-11-02', value: 0.003 });
  assert.ok(Math.abs(s.average - 0.002) < 1e-12);
});

test('the consent request always asks for read-only Gmail and adds only what is asked for', () => {
  assert.deepEqual(consentScopes(), [OFFLINE_SCOPE]);
  assert.deepEqual(consentScopes({ withSend: true }), [OFFLINE_SCOPE, SEND_SCOPE]);
  assert.deepEqual(consentScopes({ withPostmaster: true }), [OFFLINE_SCOPE, POSTMASTER_SCOPE]);
  assert.deepEqual(consentScopes({ withSend: true, withPostmaster: true }), [OFFLINE_SCOPE, SEND_SCOPE, POSTMASTER_SCOPE]);
  assert.deepEqual(consentScopes({ withSend: 'yes', withPostmaster: 1 }), [OFFLINE_SCOPE], 'only a true boolean counts');
});

test('the postmaster scope is the read-only traffic one, not the broad one', () => {
  assert.equal(POSTMASTER_SCOPE, 'https://www.googleapis.com/auth/postmaster.traffic.readonly');
});

test('a Google grant string is read scope by scope, and a partial grant keeps what was granted', () => {
  const all = grantedScopes(`${OFFLINE_SCOPE} ${SEND_SCOPE} ${POSTMASTER_SCOPE}`);
  assert.deepEqual(all, { offline: true, send: true, postmaster: true });
  const partial = grantedScopes(`${OFFLINE_SCOPE} ${POSTMASTER_SCOPE}`);
  assert.deepEqual(partial, { offline: true, send: false, postmaster: true });
  assert.deepEqual(grantedScopes(undefined), { offline: false, send: false, postmaster: false });
  assert.equal(grantedScopes(`${OFFLINE_SCOPE}`).postmaster, false, 'an unticked box is not a grant');
});
