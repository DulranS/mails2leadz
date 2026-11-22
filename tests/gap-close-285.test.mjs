// Pass 285: the approval list (follow-up drafts waiting for you, on Today), and the contact basis recorded for each new enquiry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTodayActions } from '../lib/today-actions.js';
import { contactBasisFor } from '../lib/consent-rules.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('follow-up drafts waiting for approval show on Today, first, with the right wording', () => {
  const items = buildTodayActions({ draftsToApprove: 2, leadsWaiting: 1 });
  assert.equal(items[0].key, 'draftsToApprove');
  assert.equal(items[0].text, '2 follow-up drafts are ready for your approval');
  assert.equal(items[0].href, '/dashboard');
  assert.equal(buildTodayActions({ draftsToApprove: 1 })[0].text, '1 follow-up draft is ready for your approval');
});

t('no drafts waiting means no approval line', () => {
  assert.equal(buildTodayActions({ draftsToApprove: 0 }).some((i) => i.key === 'draftsToApprove'), false);
});

t('the server counts only drafts that are ready, for this owner', () => {
  const src = fs.readFileSync('lib/server/today-actions.js', 'utf8');
  assert.ok(/collection\(db, 'draft_queue'\), where\('userId', '==', uid\), where\('status', '==', 'ready'\)/.test(src));
  assert.ok(src.includes('draftsToApprove: draftsReady.length'));
});

t('a business address we approached is legitimate-interest B2B and marketing-allowed', () => {
  assert.deepEqual(contactBasisFor({ email: 'ops@acme.co' }), { basis: 'legitimate_interests_b2b', marketingAllowed: true });
});

t('a personal address with no consent is never marketable, even though the basis is recorded', () => {
  assert.deepEqual(contactBasisFor({ email: 'a@gmail.com' }), { basis: 'legitimate_interests_b2b', marketingAllowed: false });
});

t('recorded consent with a source makes the basis consent; an invoice makes it contract', () => {
  assert.equal(contactBasisFor({ email: 'a@gmail.com', marketingConsent: true, consentSource: 'form' }).basis, 'consent');
  assert.equal(contactBasisFor({ email: 'a@gmail.com', marketingConsent: true, consentSource: '' }).basis, 'legitimate_interests_b2b');
  assert.equal(contactBasisFor({ email: 'ops@acme.co', hasInvoice: true }).basis, 'contract');
});

t('a new enquiry records its contact basis when the deal is created', () => {
  const src = fs.readFileSync('app/api/inbound/route.js', 'utf8');
  assert.ok(src.includes("write.contactBasis = contactBasisFor({ email: e.email, country: e.country }).basis")); // the chosen country is passed too (opt-in-country test)
});

console.log(`\n${n} passed`);
