// Spamhaus Domain Block List check (v357): the sending domain's listing is read, and an answer that could not be checked
// is never reported as "clear".
import assert from 'node:assert/strict';
import { evaluateBlocklist, buildSenderReport, DBL_ZONE } from '../lib/sender-auth.js';
import { blocklistLookup, checkSenderDomain } from '../lib/server/sender-auth.js';

// 1. Judging the answer
assert.equal(evaluateBlocklist({ known: true, addresses: [] }).status, 'clear', 'no answer = not listed');
assert.equal(evaluateBlocklist({ known: true, addresses: ['127.0.1.2'] }).status, 'listed', 'a spam listing is listed');
assert.deepEqual(evaluateBlocklist({ known: true, addresses: ['127.0.1.2', '127.0.1.4', '127.0.1.2'] }).labels, ['spam domain', 'phishing domain'], 'labels named once each');
assert.equal(evaluateBlocklist({ known: true, addresses: ['127.0.1.106'] }).labels[0], 'abused legitimate domain (botnet)', 'abused-legit code named');
assert.equal(evaluateBlocklist({ known: true, addresses: ['127.0.1.99'] }).labels[0], 'listed', 'an unnamed 127.0.1.x code is still a listing');
assert.equal(evaluateBlocklist({ known: true, addresses: ['127.255.255.254'] }).status, 'unknown', 'a refused query is unknown, not clear');
assert.equal(evaluateBlocklist({ known: false, addresses: [] }).status, 'unknown', 'an unfinished lookup is unknown');
assert.equal(evaluateBlocklist(undefined).status, 'unknown', 'no answer at all is unknown');
assert.match(evaluateBlocklist({ known: true, addresses: ['127.255.255.254'] }).message, /not a failure/, 'unknown says it is not a failure');

// 2. The report carries it; a free-mail domain has no blocklist section
const listed = buildSenderReport('Example.com', { spf: ['v=spf1 -all'], dmarc: ['v=DMARC1; p=none'], dkim: { selector: 'google', txts: ['v=DKIM1; k=rsa; p=abc'] }, blocklist: { known: true, addresses: ['127.0.1.2'] } });
assert.equal(listed.blocklist.status, 'listed', 'report shows the listing');
assert.equal(listed.status, 'ready', 'a listing is shown beside the records, it does not change the record status');
assert.equal(buildSenderReport('example.com', {}).blocklist.status, 'unknown', 'a report built without a lookup says unknown');
assert.equal(buildSenderReport('gmail.com').freeMail, true, 'free mail is still a provider answer');

// 3. The DNS lookup: the right name, and what each failure means
const asked = [];
const notListed = await blocklistLookup('example.com', { resolve: async (name) => { asked.push(name); throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' }); } });
assert.equal(asked[0], `example.com.${DBL_ZONE}`, 'the domain is looked up under the Spamhaus zone');
assert.deepEqual(notListed, { known: true, addresses: [] }, 'NXDOMAIN is a known "not listed"');
const hit = await blocklistLookup('bad.example', { resolve: async () => ['127.0.1.4'] });
assert.deepEqual(hit, { known: true, addresses: ['127.0.1.4'] }, 'an answer is passed through');
const broken = await blocklistLookup('example.com', { resolve: async () => { throw Object.assign(new Error('servfail'), { code: 'ESERVFAIL' }); } });
assert.equal(broken.known, false, 'a server error is unknown, not clear');
const refused = await blocklistLookup('example.com', { resolve: async () => ['127.255.255.254'] });
assert.equal(evaluateBlocklist(refused).status, 'unknown', 'a refused query stays unknown end to end');

// 4. The whole check uses it, and the DNS lookups for SPF, DMARC and DKIM are unchanged
const seen = [];
const full = await checkSenderDomain('example.com', {
  lookup: async (name) => { seen.push(name); return []; },
  blocklist: async (d) => { seen.push(`dbl:${d}`); return { known: true, addresses: ['127.0.1.2'] }; },
});
assert.equal(full.blocklist.status, 'listed', 'checkSenderDomain reports the listing');
assert.ok(seen.includes('dbl:example.com'), 'the blocklist is checked for the sending domain');
assert.ok(seen.includes('_dmarc.example.com'), 'DMARC still looked up');
let touched = false;
const free = await checkSenderDomain('gmail.com', { lookup: async () => { touched = true; return []; }, blocklist: async () => { touched = true; return { known: true, addresses: [] }; } });
assert.equal(free.freeMail, true, 'free mail answers without DNS');
assert.equal(touched, false, 'free mail does not look anything up');

// 5. The page shows it, and the route is unchanged
const { readFile } = await import('node:fs/promises');
const page = await readFile(new URL('../app/account/page.js', import.meta.url), 'utf8');
assert.ok(page.includes('senderReport.blocklist') && page.includes('Blocklist (Spamhaus)'), 'account page shows the blocklist line');
console.log('sender-blocklist: all checks passed');
