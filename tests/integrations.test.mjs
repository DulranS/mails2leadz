import assert from 'node:assert/strict';
import { integrationStatus } from '../lib/integrations.js';
import { payLinkFor, signPayToken, verifyPayToken, amountOwedOnline, checkoutCurrency, paymentPatchFromSession, paymentsReady, appendPayLine } from '../lib/server/payments.js';
import { parseMetaMonthly, planMetaImport, metaInsightsUrl, parseGoogleMonthly, googleCostQuery, planAdImport } from '../lib/server/ad-import.js';
import { resolveSecret, presenceFor } from '../lib/server/integration-secrets.js';
import { canSendWhatsApp, templateSidFor, whatsappReady } from '../lib/server/whatsapp.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const KEY = 'pay-test-key';
const get = (list, id) => list.find((i) => i.id === id);

t('a service is ready only when every key it needs is set, and missing ones are named', () => {
  const none = get(integrationStatus({}), 'stripe_payments');
  assert.equal(none.state, 'needs_keys');
  assert.ok(none.missing.includes('STRIPE_PAYMENTS_SECRET_KEY'));
  const env = { STRIPE_PAYMENTS_SECRET_KEY: 'sk_x', STRIPE_PAYMENTS_WEBHOOK_SECRET: 'whsec_x', NEXT_PUBLIC_BASE_URL: 'https://a.example', UNSUBSCRIBE_SECRET: 's' };
  assert.equal(get(integrationStatus(env), 'stripe_payments').state, 'ready');
});

t('the status never returns a key value, only names and states', () => {
  const env = { META_ACCESS_TOKEN: 'SECRET-TOKEN-123', META_AD_ACCOUNT_ID: '999' };
  const json = JSON.stringify(integrationStatus(env));
  assert.doesNotMatch(json, /SECRET-TOKEN-123|999/);
  assert.equal(get(integrationStatus(env), 'meta_ads').state, 'ready');
});

t('the AI phone assistant needs Twilio, an AI key and a public address; it is never ready on partial keys', () => {
  const partial = get(integrationStatus({ TWILIO_ACCOUNT_SID: 'AC', TWILIO_AUTH_TOKEN: 't' }), 'voice_agent');
  assert.equal(partial.state, 'needs_keys');
  assert.ok(partial.missing.some((m) => m.includes('TWILIO_PHONE_NUMBER')));
  const full = get(integrationStatus({ TWILIO_ACCOUNT_SID: 'AC', TWILIO_AUTH_TOKEN: 't', TWILIO_PHONE_NUMBER: '+1', OPENAI_API_KEY: 'k', NEXT_PUBLIC_BASE_URL: 'https://a.example' }), 'voice_agent');
  assert.equal(full.state, 'ready');
});

t('a payment link is signed, verifies, and is refused for a tampered token or a wrong key', () => {
  const tok = signPayToken('u1', 'inv9', KEY);
  assert.deepEqual(verifyPayToken(tok, KEY), { uid: 'u1', id: 'inv9' });
  assert.equal(verifyPayToken(tok, 'other'), null);
  assert.equal(verifyPayToken(`${tok}x`, KEY), null);
  assert.equal(verifyPayToken('garbage', KEY), null);
});

t('the pay link needs a signing key and a public address; plain http only outside production', () => {
  assert.equal(payLinkFor('u', 'i', { base: '', key: KEY, production: true }), null);
  assert.equal(payLinkFor('u', 'i', { base: 'https://a.example', key: '', production: true }), null);
  assert.equal(payLinkFor('u', 'i', { base: 'http://a.example', key: KEY, production: true }), null);
  assert.match(payLinkFor('u', 'i', { base: 'https://a.example', key: KEY, production: true }), /^https:\/\/a\.example\/api\/pay\?t=/);
});

t('the amount owed online is the total less what was paid, and never negative', () => {
  assert.equal(amountOwedOnline({ amount: 100, total: 110, amountPaid: 30 }), 80);
  assert.equal(amountOwedOnline({ amount: 100, total: 0, amountPaid: 250 }), 0);
  assert.equal(amountOwedOnline({ amount: 100 }), 100);
});

t('the checkout currency is a 3-letter code, and anything else falls back to USD rather than the wrong currency', () => {
  assert.equal(checkoutCurrency('lkr'), 'lkr');
  assert.equal(checkoutCurrency('RUPEES'), 'usd');
  assert.equal(checkoutCurrency(''), 'usd');
});

t('a completed payment applies to the invoice exactly as a recorded part payment does', () => {
  const inv = { amount: 100, total: 100, amountPaid: 0, onlinePaymentIds: [] };
  const part = paymentPatchFromSession({ invoice: inv, session: { id: 'cs_1', payment_status: 'paid', amount_total: 3000 } });
  assert.equal(part.patch.status, 'partial');
  assert.equal(part.patch.amountPaid, 30);
  assert.deepEqual(part.patch.onlinePaymentIds, ['cs_1']);
  const rest = paymentPatchFromSession({ invoice: { ...inv, ...part.patch }, session: { id: 'cs_2', payment_status: 'paid', amount_total: 7000 } });
  assert.equal(rest.patch.status, 'paid');
  assert.equal(rest.patch.amountPaid, 100);
});

t('a resent event for a payment already applied changes nothing', () => {
  const inv = { amount: 100, total: 100, amountPaid: 30, onlinePaymentIds: ['cs_1'] };
  assert.deepEqual(paymentPatchFromSession({ invoice: inv, session: { id: 'cs_1', payment_status: 'paid', amount_total: 3000 } }), { ok: true, duplicate: true });
});

t('a payment larger than the balance is flagged for review, not forced through; unpaid sessions are ignored', () => {
  const inv = { amount: 100, total: 100, amountPaid: 90, onlinePaymentIds: [] };
  const r = paymentPatchFromSession({ invoice: inv, session: { id: 'cs_3', payment_status: 'paid', amount_total: 5000 } });
  assert.equal(r.ok, false); assert.equal(r.review, true);
  assert.equal(paymentPatchFromSession({ invoice: inv, session: { id: 'cs_4', payment_status: 'unpaid', amount_total: 100 } }).ignore, true);
});

t('Meta monthly spend is parsed; bad rows are dropped', () => {
  const rows = parseMetaMonthly({ data: [{ date_start: '2026-08-01', spend: '120.456' }, { date_start: 'nope', spend: '5' }, { date_start: '2026-09-01', spend: '-3' }] });
  assert.deepEqual(rows, [{ month: '2026-08', amount: 120.46 }]);
  assert.deepEqual(parseMetaMonthly({}), []);
});

t('an import never overwrites a month the owner entered by hand; an earlier import of that month is replaced', () => {
  const rows = [{ month: '2026-08', amount: 50 }, { month: '2026-09', amount: 70 }, { month: '2026-10', amount: 90 }];
  const existing = [
    { channel: 'paid_ads', month: '2026-09', amount: 40 },
    { channel: 'paid_ads', month: '2026-10', amount: 90, source: 'meta' },
  ];
  const p = planMetaImport({ rows, existing, months: ['2026-08', '2026-09', '2026-10'] });
  assert.deepEqual(p.skipped, ['2026-09']);
  assert.deepEqual(p.writes.map((w) => w.id), ['meta_2026-08', 'meta_2026-10']);
  assert.equal(p.writes[0].source, 'meta');
});

t('a same-every-month manual entry that started earlier covers the months after it, so they are not imported twice', () => {
  const rows = [{ month: '2026-08', amount: 50 }, { month: '2026-10', amount: 90 }];
  const existing = [{ channel: 'paid_ads', month: '2026-08', amount: 10, recurring: true }];
  const p = planMetaImport({ rows, existing, months: ['2026-08', '2026-10'] });
  assert.deepEqual(p.skipped, ['2026-08', '2026-10']);
  assert.deepEqual(p.writes, []);
});

t('only the months in the window are imported', () => {
  const p = planMetaImport({ rows: [{ month: '2025-01', amount: 5 }, { month: '2026-10', amount: 6 }], existing: [], months: ['2026-10'] });
  assert.deepEqual(p.writes.map((w) => w.month), ['2026-10']);
});

t('the insights request names the account without its act_ prefix doubled, and asks for monthly spend only', () => {
  const url = metaInsightsUrl({ accountId: 'act_123', since: '2026-08-01', until: '2026-10-31' });
  assert.match(url, /\/act_123\/insights\?fields=spend&time_increment=monthly/);
  assert.doesNotMatch(url, /act_act_/);
});

t('a WhatsApp send needs the keys, an approved template, no opt-out, and recorded consent with a phone', () => {
  const ok = { consent: true, phone: '+94770000000' };
  assert.equal(canSendWhatsApp({ ready: false, templateSid: 'HX1', blocked: false, consent: ok }).ok, undefined);
  assert.match(canSendWhatsApp({ ready: false, templateSid: 'HX1', blocked: false, consent: ok }).error, /not connected/);
  assert.match(canSendWhatsApp({ ready: true, templateSid: '', blocked: false, consent: ok }).error, /template/);
  assert.match(canSendWhatsApp({ ready: true, templateSid: 'HX1', blocked: true, consent: ok }).error, /opted out/);
  assert.match(canSendWhatsApp({ ready: true, templateSid: 'HX1', blocked: false, consent: null }).error, /consent/);
  assert.match(canSendWhatsApp({ ready: true, templateSid: 'HX1', blocked: false, consent: { consent: false, phone: '+9' } }).error, /consent/);
  assert.deepEqual(canSendWhatsApp({ ready: true, templateSid: 'HX1', blocked: false, consent: ok }), { ok: true });
});

t('WhatsApp template ids come from the environment by kind; readiness needs the three Twilio keys', () => {
  assert.equal(templateSidFor('quote', { TWILIO_WA_TEMPLATE_QUOTE: ' HX42 ' }), 'HX42');
  assert.equal(templateSidFor('quote', {}), '');
  assert.equal(templateSidFor('nonsense', { TWILIO_WA_TEMPLATE_QUOTE: 'HX1' }), '');
  assert.equal(whatsappReady({ TWILIO_ACCOUNT_SID: 'AC', TWILIO_AUTH_TOKEN: 't', TWILIO_WHATSAPP_FROM: '+1' }), true);
  assert.equal(whatsappReady({ TWILIO_ACCOUNT_SID: 'AC' }), false);
});

t('in SaaS mode the server settings never make a service ready: only the account\'s own keys do', () => {
  const server = { META_ACCESS_TOKEN: 'op-token', META_AD_ACCOUNT_ID: '1' };
  assert.equal(get(integrationStatus(server, { saas: true }), 'meta_ads').state, 'needs_keys');
  assert.equal(get(integrationStatus(server, { saas: false }), 'meta_ads').state, 'ready');
  const own = { META_ACCESS_TOKEN: 'account', META_AD_ACCOUNT_ID: 'account' };
  assert.equal(get(integrationStatus({}, { account: own, saas: true }), 'meta_ads').state, 'ready');
});

t('the account value is used first; the server value only when not in SaaS mode', () => {
  assert.equal(resolveSecret('STRIPE_PAYMENTS_SECRET_KEY', { account: { STRIPE_PAYMENTS_SECRET_KEY: 'acct' }, env: { STRIPE_PAYMENTS_SECRET_KEY: 'op' }, saas: true }), 'acct');
  assert.equal(resolveSecret('STRIPE_PAYMENTS_SECRET_KEY', { account: {}, env: { STRIPE_PAYMENTS_SECRET_KEY: 'op' }, saas: true }), '');
  assert.equal(resolveSecret('STRIPE_PAYMENTS_SECRET_KEY', { account: {}, env: { STRIPE_PAYMENTS_SECRET_KEY: ' self ' }, saas: false }), 'self');
});

t('key presence says where a key comes from, and never carries a value', () => {
  const p = presenceFor({ TWILIO_AUTH_TOKEN: { v: 1, ct: 'x' } }, ['TWILIO_AUTH_TOKEN', 'TWILIO_ACCOUNT_SID'], { env: { TWILIO_ACCOUNT_SID: 'AC-secret' }, saas: false });
  assert.deepEqual(p, { TWILIO_AUTH_TOKEN: 'account', TWILIO_ACCOUNT_SID: 'server' });
  assert.doesNotMatch(JSON.stringify(p), /AC-secret|ct/);
  assert.equal(presenceFor({}, ['TWILIO_ACCOUNT_SID'], { env: { TWILIO_ACCOUNT_SID: 'AC' }, saas: true }).TWILIO_ACCOUNT_SID, '');
});

t('payments are ready only with the account\'s secret key and webhook secret; the pay line is appended once, plainly', () => {
  assert.equal(paymentsReady({ STRIPE_PAYMENTS_SECRET_KEY: 'sk' }), false);
  assert.equal(paymentsReady({ STRIPE_PAYMENTS_SECRET_KEY: 'sk', STRIPE_PAYMENTS_WEBHOOK_SECRET: 'whsec' }), true);
  assert.equal(appendPayLine('Please pay.', 'https://a.example/api/pay?t=x'), 'Please pay.\n\nPay by card online: https://a.example/api/pay?t=x');
  assert.equal(appendPayLine('Please pay.', null), 'Please pay.');
});

t('Google Ads spend is summed per month in whole cents; bad rows are dropped', () => {
  const rows = parseGoogleMonthly([
    { results: [{ segments: { month: '2026-10-01' }, metrics: { costMicros: '1500000000' } }] },
    { results: [{ segments: { month: '2026-10-01' }, metrics: { costMicros: '500000000' } }, { segments: { month: 'x' }, metrics: { costMicros: '1' } }] },
  ]);
  assert.deepEqual(rows, [{ month: '2026-10', amount: 2000 }]);
  assert.deepEqual(parseGoogleMonthly(undefined), []);
});

t('the Google report asks only for monthly cost, and refuses a malformed date range', () => {
  assert.match(googleCostQuery('2026-08-01', '2026-10-31'), /SELECT segments\.month, metrics\.cost_micros FROM customer WHERE segments\.date BETWEEN '2026-08-01' AND '2026-10-31'/);
  assert.throws(() => googleCostQuery("2026-08-01' OR 1=1", '2026-10-31'));
});

t('Meta and Google imports do not count as manual entries for each other, but a manual month blocks both', () => {
  const existing = [{ channel: 'paid_ads', month: '2026-09', amount: 40, source: 'google' }, { channel: 'paid_ads', month: '2026-08', amount: 5 }];
  const meta = planAdImport({ rows: [{ month: '2026-09', amount: 70 }], existing, months: ['2026-09'], source: 'meta' });
  assert.deepEqual(meta.writes.map((w) => w.id), ['meta_2026-09']);
  const google = planAdImport({ rows: [{ month: '2026-08', amount: 9 }], existing, months: ['2026-08'], source: 'google' });
  assert.deepEqual(google.skipped, ['2026-08']);
  assert.throws(() => planAdImport({ rows: [], existing: [], months: [], source: 'tiktok' }));
});

console.log(`integrations: ${n} passed`);
