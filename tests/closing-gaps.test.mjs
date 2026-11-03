// Gap closures (Pass 151): typed-name quote acceptance, logged hours in the profit view, and TikTok lead-form intake.
import assert from 'node:assert/strict';
import { respondToQuote } from '../lib/quote-core.js';
import { computeProfit } from '../lib/profit.js';
import { loggedByEmail } from '../lib/time-log.js';
import { tiktokKeyOk, leadFromTiktok } from '../lib/tiktok-leads.js';
import { sanitizeAngles, filterApprovedAngles } from '../lib/autosend.js';
import { linkedinKeyOk, leadFromLinkedin } from '../lib/linkedin-leads.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const open = { status: 'sent', validUntil: '2099-01-01', lines: [], total: 100 };

t('accepting a quote needs the customer\'s full name typed in; declining does not', () => {
  const refused = respondToQuote(open, 'accept', { name: '' });
  assert.match(refused.error, /Type your full name/);
  const ok = respondToQuote(open, 'accept', { name: '  Ann   Lee ' });
  assert.equal(ok.patch.status, 'accepted');
  assert.equal(ok.patch.signedName, 'Ann Lee');
  assert.ok(ok.patch.signedAt);
  assert.equal(respondToQuote(open, 'decline', { name: '' }).patch.status, 'declined');
});

t('logged hours per customer add up by address', () => {
  assert.deepEqual(loggedByEmail([{ dealEmail: 'Ann@x.com', hours: 2 }, { dealEmail: 'ann@x.com', hours: 1.5 }, { dealEmail: 'bob@x.com', hours: 4 }]), { 'ann@x.com': 3.5, 'bob@x.com': 4 });
});

t('a won deal with no hours typed takes its logged hours in the profit view', () => {
  const deal = { email: 'ann@x.com', businessName: 'Ann Ltd', stage: 'closed_won', value: 1000, valueIsEstimate: false, deliveryCost: 200, lastUpdate: new Date().toISOString(), closedAt: new Date().toISOString() };
  const withLog = computeProfit({ deals: [deal], settings: {}, loggedHoursByEmail: { 'ann@x.com': 6 } });
  const without = computeProfit({ deals: [deal], settings: {} });
  assert.equal(withLog.time.hours, 6, 'logged hours reach the profit view');
  assert.equal(without.time.hours, 0);
  assert.notEqual(JSON.stringify(withLog), JSON.stringify(without));
});

t('a TikTok lead is accepted only with its key, and mapped to the inbox lead', () => {
  assert.equal(tiktokKeyOk('k-123', 'k-123'), true);
  assert.equal(tiktokKeyOk('k-124', 'k-123'), false);
  assert.equal(tiktokKeyOk('', 'k-123'), false);
  assert.deepEqual(leadFromTiktok({ campaign_id: '9', user_info: { name: 'Ann Lee', email: 'ann@x.com', phone_number: '+447700900000', company_name: 'Ann Ltd' } }),
    { email: 'ann@x.com', first_name: 'Ann', last_name: 'Lee', phone_primary: '+447700900000', business_name: 'Ann Ltd', campaign: 'tiktok-lead-form 9' });
  assert.equal(leadFromTiktok({ user_info: { name: 'No Email' } }), null);
});

t('campaign angles: sanitised, and only approved angles are sent', () => {
  assert.deepEqual(sanitizeAngles(' Referral, follow-up ,referral, '), ['referral', 'follow-up']);
  const drafts = [{ id: 'a', angle: 'referral' }, { id: 'b', angle: 'cold' }, { id: 'c' }];
  assert.deepEqual(filterApprovedAngles(drafts, ['referral']).map((d) => d.id), ['a']);
  assert.deepEqual(filterApprovedAngles(drafts, ['general']).map((d) => d.id), ['c']);
  assert.deepEqual(filterApprovedAngles(drafts, []).map((d) => d.id), []);
});

t('a LinkedIn lead-gen submission is accepted only with its key, and its answers map to the inbox lead', () => {
  assert.equal(linkedinKeyOk('lk-1', 'lk-1'), true);
  assert.equal(linkedinKeyOk('lk-2', 'lk-1'), false);
  assert.deepEqual(leadFromLinkedin({ campaignId: '7', answers: [
    { question: 'Full name', answer: 'Cy Park' }, { question: 'Work email', answer: 'cy@x.com' },
    { question: 'Company name', answer: 'Park Ltd' }, { question: 'Phone number', answer: '+447700900222' } ] }),
    { email: 'cy@x.com', first_name: 'Cy', last_name: 'Park', phone_primary: '+447700900222', business_name: 'Park Ltd', campaign: 'linkedin-lead-form 7' });
  assert.equal(leadFromLinkedin({ answers: [{ question: 'Full name', answer: 'No Email' }] }), null);
});

console.log(`\n${n} passed`);
