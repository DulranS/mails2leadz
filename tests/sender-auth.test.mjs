// Sender authentication: DNS records are read and judged correctly, and the report says what to fix.
import assert from 'node:assert/strict';
import { normalizeDomain, evaluateSpf, evaluateDkim, evaluateDmarc, buildSenderReport } from '../lib/sender-auth.js';
import { checkSenderDomain } from '../lib/server/sender-auth.js';

// 1. Domains are cleaned from what people actually paste.
assert.equal(normalizeDomain('Owner@Example.COM'), 'example.com', 'address reduced to its domain');
assert.equal(normalizeDomain('https://shop.example.com/path'), 'shop.example.com', 'URL reduced to its host');
assert.equal(normalizeDomain('example.com.'), 'example.com', 'trailing dot removed');
assert.equal(normalizeDomain('not a domain'), '', 'spaces refused');
assert.equal(normalizeDomain('localhost'), '', 'single label refused');

// 2. SPF: a fail rule at the end passes; +all, ?all, a missing rule and too many lookups do not.
assert.equal(evaluateSpf(['v=spf1 include:_spf.google.com ~all']).ok, true, '~all passes');
assert.equal(evaluateSpf(['v=spf1 include:_spf.google.com -all']).ok, true, '-all passes');
assert.equal(evaluateSpf(['v=spf1 include:_spf.google.com +all']).ok, false, '+all fails: anyone may send');
assert.equal(evaluateSpf(['v=spf1 include:_spf.google.com ?all']).ok, false, '?all is neutral, not enough');
assert.equal(evaluateSpf(['v=spf1 include:_spf.google.com']).ok, false, 'no all rule fails');
assert.equal(evaluateSpf(['google-site-verification=abc']).found, false, 'other TXT records are not SPF');
const many = 'v=spf1 ' + Array.from({ length: 11 }, (_, i) => `include:s${i}.example.net`).join(' ') + ' -all';
assert.equal(evaluateSpf([many]).ok, false, 'more than 10 lookups fails');

// 3. DKIM: a real key passes; an empty p= (revoked) fails; a missing record is explained.
assert.equal(evaluateDkim({ selector: 'google', txts: ['v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEF'] }).ok, true, 'key present');
assert.equal(evaluateDkim({ selector: 'google', txts: ['v=DKIM1; k=rsa; p='] }).ok, false, 'revoked key fails');
assert.equal(evaluateDkim(null).ok, false, 'no key found fails');

// 4. DMARC: p=none passes but warns; reject passes clean; missing fails.
const none = evaluateDmarc(['v=DMARC1; p=none; rua=mailto:dmarc@example.com']);
assert.equal(none.ok, true); assert.equal(none.policy, 'none');
assert.ok(none.warnings.some((w) => /monitor only/.test(w)), 'p=none carries a warning');
assert.equal(evaluateDmarc(['v=DMARC1; p=reject; rua=mailto:x@example.com']).warnings.length, 0, 'reject with reports: no warning');
assert.ok(evaluateDmarc(['v=DMARC1; p=reject']).warnings.some((w) => /rua/.test(w)), 'no rua: warned');
assert.equal(evaluateDmarc([]).ok, false, 'missing DMARC fails');

// 5. The overall status says what state the domain is in.
const good = buildSenderReport('example.com', {
  spf: ['v=spf1 include:_spf.google.com ~all'],
  dkim: { selector: 'google', txts: ['v=DKIM1; k=rsa; p=AAAA'] },
  dmarc: ['v=DMARC1; p=reject; rua=mailto:d@example.com'],
});
assert.equal(good.status, 'ready');
assert.equal(buildSenderReport('example.com', {}).status, 'missing', 'nothing published: missing');
const half = buildSenderReport('example.com', { spf: ['v=spf1 -all'], dkim: null, dmarc: [] });
assert.equal(half.status, 'partial');
assert.equal(half.checks.find((c) => c.id === 'dkim').ok, false, 'the DKIM check is reported');
assert.equal(buildSenderReport('gmail.com', {}).freeMail, true, 'free mail is explained, not judged');
assert.match(buildSenderReport('bad domain!', {}).error, /Enter a domain/);

// 6. The live checker reads records through an injected lookup (no network in tests).
const records = {
  'example.com': ['v=spf1 include:_spf.google.com ~all'],
  '_dmarc.example.com': ['v=DMARC1; p=quarantine; rua=mailto:d@example.com'],
  'google._domainkey.example.com': ['v=DKIM1; k=rsa; p=MIIB'],
};
const seen = [];
const report = await checkSenderDomain('example.com', { lookup: async (name) => { seen.push(name); return records[name] || []; } });
assert.equal(report.status, 'ready', 'a fully set up domain is ready');
assert.equal(report.checks.find((c) => c.id === 'dkim').selector, 'google', 'the DKIM selector is reported');
assert.ok(seen.includes('_dmarc.example.com'), 'DMARC is looked up at _dmarc');
const none2 = await checkSenderDomain('empty.example.org', { lookup: async () => [] });
assert.equal(none2.status, 'missing', 'an unconfigured domain is reported as missing');

console.log('sender-auth tests: all passed');
