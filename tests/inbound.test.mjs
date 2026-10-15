import assert from 'node:assert/strict';
import { sanitizeEnquiry, normalizeSrc, channelLabel, enquiryDocId, enquiryContext, hoursSince, INBOUND_DRAFTS_PER_DAY } from '../lib/inbound.js';
import { computeBusinessMetrics } from '../lib/business-metrics.js';
import { buildDealWrite } from '../lib/deal-utils.js';
import { buildNextActions } from '../lib/next-actions.js';
import { summarizeQueue, toReviewItem } from '../lib/draft-queue.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const now = Date.parse('2026-10-15T12:00:00Z');
const iso = (hoursAgo) => new Date(now - hoursAgo * 3600000).toISOString();

t('a good enquiry is cleaned and lower-cased; tags are normalised', () => {
  const r = sanitizeEnquiry({ name: '  Ana  Lee ', email: ' ANA@Shop.com ', phone: 'tel: +94 77 123-4567', message: 'Do you do   weekends?', src: 'Instagram Bio!!', campaign: 'Spring Promo' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.enquiry, { email: 'ana@shop.com', name: 'Ana Lee', phone: '+94 77 123-4567', company: '', message: 'Do you do weekends?', src: 'instagram-bio', campaign: 'spring-promo' });
});

t('bad emails are refused with a human message; "/" can never reach a database id', () => {
  for (const bad of ['', 'nope', 'a@b', 'a b@c.com', 'a/b@c.com', 'a@b/c.com', '<x>@y.com']) {
    const r = sanitizeEnquiry({ email: bad });
    assert.equal(r.ok, false, bad);
    assert.ok(r.error && !r.spam, bad);
  }
});

t('bots: honeypot filled or link-stuffed messages are "spam" (answered 200, never stored)', () => {
  assert.deepEqual(sanitizeEnquiry({ email: 'a@b.com', company_site: 'http://x.com' }), { ok: false, spam: true, error: 'spam' });
  assert.equal(sanitizeEnquiry({ email: 'a@b.com', message: 'buy http://a.com http://b.com https://c.com now' }).spam, true);
  assert.equal(sanitizeEnquiry({ email: 'a@b.com', message: 'see our site www.example.com please' }).ok, true); // one link is normal
});

t('fields are length-capped and control characters stripped', () => {
  const r = sanitizeEnquiry({ email: 'a@b.com', name: 'x'.repeat(500), message: 'hi\u0000there' + 'y'.repeat(5000) });
  assert.equal(r.enquiry.name.length, 80);
  assert.ok(r.enquiry.message.length <= 1500);
  assert.ok(!r.enquiry.message.includes('\u0000'));
});

t('channel labels: known tags get names, unknown tags are shown as typed, empty is explicit', () => {
  assert.equal(normalizeSrc('  QR / Flyer '), 'qr-flyer');
  assert.equal(channelLabel('instagram'), 'Instagram');
  assert.equal(channelLabel('ig'), 'Instagram');
  assert.equal(channelLabel('instagram-bio'), 'Instagram');
  assert.equal(channelLabel('spring-flyer'), 'Spring flyer');
  assert.equal(channelLabel(''), 'Direct / not tagged');
});

t('one enquiry doc per owner / day / email (a double submit cannot make two drafts)', () => {
  const d = new Date('2026-10-15T08:00:00Z');
  assert.equal(enquiryDocId('u1', 'A@B.com', d), 'u1_20261015_a@b.com');
  assert.notEqual(enquiryDocId('u1', 'a@b.com', d), enquiryDocId('u2', 'a@b.com', d));
  assert.ok(INBOUND_DRAFTS_PER_DAY > 0 && INBOUND_DRAFTS_PER_DAY <= 50);
});

t('review context carries who, where from and what they asked; hoursSince floors', () => {
  const c = enquiryContext({ name: 'Ana', company: 'Shop', src: 'instagram', message: 'Do you do weekends?' });
  assert.ok(c.includes('Ana, Shop') && c.includes('Instagram') && c.includes('weekends'));
  assert.equal(hoursSince(now - 5.9 * 3600000, now), 5);
  assert.equal(hoursSince(null, now), null);
});

t('queue: inbound replies are counted apart from cold first emails and keep their context', () => {
  assert.deepEqual(summarizeQueue([{ kind: 'first' }, { kind: 'first', inbound: true }, { kind: 'followup' }]), { first: 1, followup: 1, inbound: 1, total: 3 });
  const it = toReviewItem({ kind: 'first', inbound: true, context: 'Enquiry from Ana', email: 'a@b.com', business: 'Ana', subject: 's', body: 'b' }, 'id');
  assert.equal(it.inbound, true);
  assert.equal(it.context, 'Enquiry from Ana');
  assert.equal(toReviewItem({ kind: 'first', email: 'a@b.com', subject: 's', body: 'b' }, 'id').inbound, undefined);
});

t('deal write: channel is stored only on creation and only with a source', () => {
  const w = buildDealWrite({ uid: 'u', email: 'a@b.com', stage: 'new', source: 'inbound', sourceDetail: 'instagram' });
  assert.equal(w.source, 'inbound'); assert.equal(w.sourceDetail, 'instagram');
  assert.equal(buildDealWrite({ uid: 'u', email: 'a@b.com', stage: 'new', sourceDetail: 'instagram' }).sourceDetail, undefined);
  assert.equal(buildDealWrite({ uid: 'u', email: 'a@b.com', stage: 'demo', source: 'inbound', sourceDetail: 'x', existing: { stage: 'new', source: 'inbound' } }).sourceDetail, undefined);
});

const deal = (email, stage, extra = {}) => ({ email, stage, value: 1000, valueIsEstimate: false, createdAt: iso(48), lastUpdate: iso(1), reached: [stage], source: 'inbound', sourceDetail: 'instagram', ...extra });
t('metrics: inbound by channel counts enquiries, real opportunities and revenue per channel', () => {
  const m = computeBusinessMetrics({ now, outreach: { sent: 0, replied: 0 }, deals: [
    deal('a@x.com', 'new'), deal('b@x.com', 'qualified'), deal('c@x.com', 'closed_won', { value: 3000, reached: ['new', 'qualified', 'closed_won'] }),
    deal('d@x.com', 'closed_lost', { reached: ['new', 'qualified', 'closed_lost'], lostReason: 'price' }),
    deal('e@x.com', 'new', { sourceDetail: 'qr' }), deal('f@x.com', 'new', { sourceDetail: '' }),
    deal('g@x.com', 'new', { source: 'referral', sourceDetail: '' }), deal('h@x.com', 'closed_lost', { lostReason: 'unsubscribed', reached: ['new', 'closed_lost'] }),
  ] });
  const ig = m.past.inboundByChannel.find((r) => r.channel === 'instagram');
  assert.deepEqual([ig.enquiries, ig.qualified, ig.won, ig.revenue], [4, 3, 1, 3000]);
  assert.equal(m.past.inboundByChannel[0].channel, 'instagram'); // revenue first
  assert.equal(m.past.inboundByChannel.find((r) => r.channel === 'qr').enquiries, 1);
  assert.equal(m.past.inboundByChannel.find((r) => r.channel === '').label, 'Direct / not tagged');
  assert.ok(!m.past.inboundByChannel.some((r) => r.enquiries === 0));
  assert.equal(m.past.inboundByChannel.reduce((a, r) => a + r.enquiries, 0), 6); // referral and the opt-out are not inbound enquiries
});

t('metrics + next actions: unanswered enquiries come first, oldest first, with their age', () => {
  const m = computeBusinessMetrics({ now, outreach: { sent: 0, replied: 0 }, deals: [deal('a@x.com', 'new', { createdAt: iso(30) }), deal('b@x.com', 'new', { createdAt: iso(2) }), deal('c@x.com', 'contacted')] });
  assert.deepEqual(m.present.inboundWaiting.map((w) => [w.email, w.ageHours]), [['a@x.com', 30], ['b@x.com', 2]]);
  const acts = buildNextActions({ metrics: m, unconvertedReplies: [{ email: 'z@x.com' }] });
  assert.equal(acts[0].id, 'inbound');
  assert.ok(acts[0].title.startsWith('2 new enquiries are waiting') && acts[0].title.includes('30h'));
  assert.equal(buildNextActions({ metrics: computeBusinessMetrics({ now, deals: [deal('c@x.com', 'contacted')], outreach: { sent: 0, replied: 0 } }) }).some((a) => a.id === 'inbound'), false);
});

console.log(`${n} inbound tests passed`);
