// Switches (on/off and keys), the claim hold, Apollo mapping and the TikTok body (Pass 146).
import assert from 'node:assert/strict';
import { switchState, sanitizeSwitches, SWITCHES } from '../lib/switches.js';
import { claimRisk } from '../lib/claim-risk.js';
import { apolloEnrichment } from '../lib/apollo.js';
import { tiktokEventsBody } from '../lib/tiktok-sync.js';
import { hashEmail } from '../lib/consent-guard.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a switch runs only when the owner turned it on AND the server has its keys', () => {
  assert.equal(switchState('googleSync', {}, {}).status, 'off');
  assert.equal(switchState('googleSync', { switches: { googleSync: true } }, {}).status, 'needs_keys');
  assert.ok(switchState('googleSync', { switches: { googleSync: true } }, {}).missing.includes('GOOGLE_ADS_DEVELOPER_TOKEN'));
  assert.equal(switchState('liveVoice', { switches: { liveVoice: true } }, { OPENAI_API_KEY: 'k' }).on, true);
  assert.equal(switchState('liveVoice', { switches: { liveVoice: false } }, { OPENAI_API_KEY: 'k' }).on, false);
});

t('the claim hold is on by default and the owner can turn it off', () => {
  assert.equal(switchState('holdClaimRisk', {}, {}).on, true);
  assert.equal(switchState('holdClaimRisk', { switches: { holdClaimRisk: false } }, {}).on, false);
});

t('only known switches with boolean values are kept', () => {
  assert.deepEqual(sanitizeSwitches({ enrichDeals: true, tiktokSync: 'yes', bogus: true }), { enrichDeals: true });
  assert.deepEqual(Object.keys(SWITCHES).sort(), ['ebayAutoPublish', 'enrichDeals', 'googleSync', 'holdClaimRisk', 'journeyAutoSend', 'liveVoice', 'rentalTexts', 'stripeConnect', 'supportAutoReply', 'tiktokSync', 'visitorVoice']);
});

t('the claim check flags price, result, guarantee, urgency and superlative wording, and passes plain wording', () => {
  assert.equal(claimRisk('Our plan is $49 a month').flagged, true);
  assert.ok(claimRisk('We guarantee results').reasons.includes('guarantee'));
  assert.ok(claimRisk('Double your leads in 30 days').reasons.includes('results'));
  assert.ok(claimRisk('Offer ends today').reasons.includes('urgency'));
  assert.ok(claimRisk('The best agency in town').reasons.includes('superlative'));
  assert.equal(claimRisk('Hi Ann, would a quick call next week suit you?').flagged, false);
});

t('Apollo replies map to the CRM fields; an empty reply maps to nothing', () => {
  const e = apolloEnrichment({ person: { title: 'Ops Director', organization: { name: 'Acme', estimated_num_employees: 40, industry: 'Logistics' } } }, new Date('2026-11-03T10:00:00Z'));
  assert.equal(e.title, 'Ops Director');
  assert.equal(e.company_size, 40);
  assert.equal(e.source, 'apollo');
  assert.equal(apolloEnrichment({ person: null }), null);
});

t('the TikTok body carries hashed emails of consented customers only', () => {
  const customers = [
    { email: 'a@x.com', marketingConsent: true, consentAt: '2026-11-02', consentSource: 'double opt-in signup' },
    { email: 'b@x.com', marketingConsent: false, consentAt: '2026-11-02', consentSource: 'form' },
  ];
  const body = tiktokEventsBody({ pixelCode: 'PIX1', customers, eventTime: Date.UTC(2026, 10, 3) });
  assert.equal(body.event_source_id, 'PIX1');
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].user.email, hashEmail('a@x.com'));
  assert.doesNotMatch(JSON.stringify(body), /@x\.com/);
});

console.log(`\n${n} passed`);
