import assert from 'node:assert/strict';
import { sanitizeConversation, defaultStageFor, planConversation, channelLabel, CHANNELS, MAX_TEXT } from '../lib/conversations.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = new Date('2026-10-20T06:00:00Z');
const ok = (o = {}) => sanitizeConversation({ email: 'Owner@Acme.LK ', text: 'Sounds good, send a quote', channel: 'whatsapp', businessName: '  Acme   Ltd ', ...o });

t('form: an email and some words are required; junk is cleaned; unknown channels become Other; text is capped', () => {
  const v = ok(); assert.equal(v.ok, true);
  assert.deepEqual(v.value, { email: 'owner@acme.lk', text: 'Sounds good, send a quote', channel: 'whatsapp', businessName: 'Acme Ltd' });
  assert.equal(ok({ email: 'not-an-email' }).ok, false); assert.match(ok({ email: '' }).error, /email/i);
  assert.equal(ok({ email: 'a@b' }).ok, false); assert.equal(ok({ email: 'a b@c.lk' }).ok, false);
  assert.equal(ok({ text: ' ' }).ok, false);
  assert.equal(ok({ channel: 'carrier-pigeon' }).value.channel, 'other');
  assert.equal(ok({ text: 'x'.repeat(5000) }).value.text.length, MAX_TEXT);
  assert.equal(sanitizeConversation(null).ok, false);
  assert.equal(channelLabel('whatsapp'), 'WhatsApp'); assert.equal(channelLabel('zz'), 'Other'); assert.ok(CHANNELS.length >= 8);
});
t('default stage: open deals only move forward; no/stop suggests Lost; won and lost deals are left to a person; a new person starts at contacted or the suggestion', () => {
  assert.equal(defaultStageFor({ stage: 'contacted' }, 'interested'), 'qualified');
  assert.equal(defaultStageFor({ stage: 'proposal' }, 'interested'), 'proposal'); // never backwards
  assert.equal(defaultStageFor({ stage: 'qualified' }, 'meeting_request'), 'demo');
  assert.equal(defaultStageFor({ stage: 'qualified' }, 'not_interested'), 'closed_lost');
  assert.equal(defaultStageFor({ stage: 'qualified' }, 'unsubscribe'), 'closed_lost');
  assert.equal(defaultStageFor({ stage: 'closed_won' }, 'not_interested'), 'closed_won');
  assert.equal(defaultStageFor({ stage: 'closed_lost' }, 'interested'), 'closed_lost');
  assert.equal(defaultStageFor(null, 'interested'), 'qualified');
  assert.equal(defaultStageFor(null, 'other'), 'contacted');
  assert.equal(defaultStageFor({ stage: 'qualified' }, 'not_now'), 'qualified');
});
t('saving a new person: a deal is created at the confirmed stage, credited to the channel, stamped as touched, follow-ups stop', () => {
  const p = planConversation({ uid: 'u1', value: ok().value, intent: 'interested', summary: 'Wants a quote', now: NOW });
  assert.equal(p.write.userId, 'u1'); assert.equal(p.write.email, 'owner@acme.lk'); assert.equal(p.write.stage, 'qualified');
  assert.equal(p.write.source, 'other'); assert.equal(p.write.sourceDetail, 'whatsapp'); assert.equal(p.write.businessName, 'Acme Ltd');
  assert.equal(p.write.lastTouchAt, NOW.toISOString()); assert.equal(p.write.createdAt, NOW.toISOString()); assert.equal(p.write.reachedFull, true);
  assert.equal(p.stageChanged, true); assert.equal(p.stopFollowUps, true);
  assert.deepEqual(p.row, { email: 'owner@acme.lk', businessName: 'Acme Ltd', channel: 'whatsapp', text: 'Sounds good, send a quote', intent: 'interested', summary: 'Wants a quote', stage: 'qualified', at: NOW.toISOString() });
});
t('saving for an existing deal: history is kept (created date, stage times, original source), stage moves only as confirmed', () => {
  const existing = { email: 'owner@acme.lk', stage: 'contacted', createdAt: '2026-10-01T00:00:00.000Z', businessName: 'Acme Ltd', reached: ['new', 'contacted'], stageTimes: { contacted: '2026-10-02T00:00:00.000Z' }, source: 'referral' };
  const p = planConversation({ uid: 'u1', value: ok({ businessName: '' }).value, existing, intent: 'meeting_request', now: NOW });
  assert.equal(p.write.stage, 'demo'); assert.equal(p.write.createdAt, undefined); assert.equal(p.write.source, undefined); // set once, on creation
  assert.deepEqual(p.write.reached, ['new', 'contacted', 'demo']); assert.equal(p.write.stageTimes.contacted, '2026-10-02T00:00:00.000Z'); assert.equal(p.write.stageTimes.demo, NOW.toISOString());
  assert.equal(p.row.businessName, 'Acme Ltd'); assert.equal(p.stageChanged, true);
  const same = planConversation({ uid: 'u1', value: ok().value, existing, stage: 'contacted', intent: 'question', now: NOW });
  assert.equal(same.stageChanged, false);
  const override = planConversation({ uid: 'u1', value: ok().value, existing, stage: 'proposal', intent: 'interested', now: NOW });
  assert.equal(override.write.stage, 'proposal'); // the owner's choice wins over the suggestion
});
t('losing a deal records a reason; out-of-office never stops follow-ups; the owner can keep them going', () => {
  const lost = planConversation({ uid: 'u1', value: ok().value, existing: { stage: 'qualified' }, intent: 'not_interested', now: NOW });
  assert.equal(lost.write.stage, 'closed_lost'); assert.equal(lost.write.lostReason, 'not_interested'); assert.ok(lost.write.closedAt);
  assert.equal(planConversation({ uid: 'u1', value: ok().value, existing: { stage: 'qualified' }, stage: 'closed_lost', lostReason: 'price', intent: 'other', now: NOW }).write.lostReason, 'price');
  assert.equal(planConversation({ uid: 'u1', value: ok().value, intent: 'out_of_office', now: NOW }).stopFollowUps, false);
  assert.equal(planConversation({ uid: 'u1', value: ok().value, intent: 'interested', stopFollowUps: false, now: NOW }).stopFollowUps, false);
});
t('a logged conversation can credit a team member, and leaves the owner alone when none is chosen', () => {
  const v = sanitizeConversation({ email: 'o@x.lk', text: 'Interested, call me', channel: 'call' }).value;
  assert.equal(planConversation({ uid: 'u', value: v, ownerId: 'sam', now: new Date('2026-10-20T06:00:00Z') }).write.ownerId, 'sam');
  assert.equal('ownerId' in planConversation({ uid: 'u', value: v, now: new Date('2026-10-20T06:00:00Z') }).write, false);
});
console.log(`\n${n} conversations tests ok`);
