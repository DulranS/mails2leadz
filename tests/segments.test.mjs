// Segments and broadcasts (Pass 232): segments filter what the owner asks; only people who agreed and are not opted out get a broadcast; the campaign report groups results by campaign.
import assert from 'node:assert/strict';
import { applySegment, broadcastRecipients, campaignReport, MAX_BROADCAST, DAILY_BROADCAST_CAP } from '../lib/segments.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000, now = Date.parse('2026-11-06T12:00:00Z');
const contacts = [
  { email: 'a@x.com', tags: ['vip'], source: 'meta', stage: 'won', city: 'Colombo', value: 900, lastActiveAt: new Date(now - 2 * DAY).toISOString(), consent: true },
  { email: 'b@x.com', tags: ['cold'], source: 'google', stage: 'lost', city: 'Kandy', value: 50, lastActiveAt: new Date(now - 90 * DAY).toISOString(), consent: true },
  { email: 'c@x.com', tags: ['vip'], source: 'meta', stage: 'new', city: 'Colombo', value: 0, lastActiveAt: '', consent: false },
];

t('a segment narrows by tag, source, city, value and recent activity, and all filters must match', () => {
  assert.deepEqual(applySegment(contacts, { tags: ['vip'] }, now).map((c) => c.email), ['a@x.com', 'c@x.com']);
  assert.deepEqual(applySegment(contacts, { sources: ['google'] }, now).map((c) => c.email), ['b@x.com']);
  assert.deepEqual(applySegment(contacts, { city: 'colombo', minValue: 100 }, now).map((c) => c.email), ['a@x.com']);
  assert.deepEqual(applySegment(contacts, { activeWithinDays: 30 }, now).map((c) => c.email), ['a@x.com']);
  assert.equal(applySegment(contacts, {}, now).length, 3);
});

t('a broadcast reaches only people who agreed, and never someone opted out', () => {
  const matched = applySegment(contacts, {}, now);
  const r = broadcastRecipients(matched, new Set(['b@x.com']));
  assert.deepEqual(r.eligible, ['a@x.com']);
  assert.equal(r.excluded.find((x) => x.email === 'b@x.com').why, 'opted out or do-not-contact');
  assert.equal(r.excluded.find((x) => x.email === 'c@x.com').why, 'no agreement to hear from you');
});

t('broadcasts are capped per batch and per day', () => {
  assert.equal(MAX_BROADCAST, 300);
  assert.equal(DAILY_BROADCAST_CAP, 200);
});

t('the campaign report groups sends and revenue by campaign, with untagged results shown separately', () => {
  const rows = campaignReport({
    sends: [{ campaign: 'spring' }, { campaign: 'spring' }, { campaign: 'autumn' }],
    deals: [{ stage: 'closed_won', value: 500, utmCampaign: 'spring' }, { stage: 'closed_won', value: 200 }],
    invoices: [{ status: 'paid', amountPaid: 100, utmCampaign: 'autumn' }],
  });
  const spring = rows.find((r) => r.campaign === 'spring');
  assert.equal(spring.sends, 2);
  assert.equal(spring.revenue, 500);
  assert.equal(rows.find((r) => r.campaign === 'untagged').revenue, 200);
  assert.equal(rows.find((r) => r.campaign === 'autumn').revenue, 100);
});

console.log(`\n${n} passed`);
