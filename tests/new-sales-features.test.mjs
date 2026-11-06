// Pass 174: tender drafts, Purchase events for consented customers, and visitor voice instructions.
import assert from 'node:assert/strict';
import { parseBidDraft, bidDraftPrompt } from '../lib/bid-draft.js';
import { purchaseBody } from '../lib/meta-purchases.js';
import { visitorInstructions } from '../lib/visitor-voice.js';
import { hashEmail } from '../lib/consent-guard.js';
import { pdlEnrichment } from '../lib/pdl.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a tender draft keeps only the sections, cleaned; an empty draft is refused', () => {
  const r = parseBidDraft({ executiveSummary: 'We will deliver the regional care service on time and within budget.', complianceChecklist: ['  Insurance certificate  ', '', 'Tax clearance'], questionsForBuyer: 'not a list' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.complianceChecklist, ['Insurance certificate', 'Tax clearance']);
  assert.deepEqual(r.value.questionsForBuyer, []);
  assert.match(parseBidDraft({ executiveSummary: 'short' }).error, /empty/);
});

t('the tender prompt carries the tender and the profile, and is capped', () => {
  const p = bidDraftPrompt('x'.repeat(30000), 'Ann Ltd');
  assert.ok(p.length < 22500);
  assert.match(p, /Business profile:\nAnn Ltd/);
});

t('a Purchase event is sent only for a paid invoice whose buyer consented, after the last run, hashed', () => {
  const consented = new Set(['ann@x.com']);
  const invoices = [
    { email: 'ann@x.com', status: 'paid', paidAt: '2026-11-04T10:00:00Z', amountPaid: 120.5, chargeCurrency: 'eur' },
    { email: 'bob@x.com', status: 'paid', paidAt: '2026-11-04T10:00:00Z', amountPaid: 50 },
    { email: 'ann@x.com', status: 'paid', paidAt: '2026-10-01T10:00:00Z', amountPaid: 70 },
    { email: 'ann@x.com', status: 'open', total: 99 },
  ];
  const body = purchaseBody({ invoices, consentedEmails: consented, since: Date.parse('2026-11-01T00:00:00Z') });
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].event_name, 'Purchase');
  assert.deepEqual(body.data[0].custom_data, { currency: 'EUR', value: 120.5 });
  assert.equal(body.data[0].user_data.em[0], hashEmail('ann@x.com'));
  assert.doesNotMatch(JSON.stringify(body), /@x\.com/);
});

t('visitor voice says it is the business\'s assistant on the public site, and keeps the no-prices rule', () => {
  const s = visitorInstructions({ businessName: 'Ann Ltd', offer: 'care plans' });
  assert.match(s, /voice assistant for Ann Ltd/);
  assert.match(s, /public website/);
  assert.match(s, /Do not quote prices/);
});

t('the second enrichment provider maps its person reply to the same CRM fields, and an empty reply maps to nothing', () => {
  const e = pdlEnrichment({ data: { job_title: 'Ops Director', job_company_name: 'Acme', job_company_size: '51-200' } }, new Date('2026-11-04T09:00:00Z'));
  assert.equal(e.title, 'Ops Director');
  assert.equal(e.company, 'Acme');
  assert.equal(e.company_size, '51-200');
  assert.equal(e.source, 'pdl');
  assert.equal(pdlEnrichment({ data: {} }), null);
});

console.log(`\n${n} passed`);
