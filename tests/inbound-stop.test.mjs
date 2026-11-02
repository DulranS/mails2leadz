// When someone contacts the business themselves, their scheduled cold follow-ups stop; other people's do not.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register(new URL('./fixtures/loader.mjs', import.meta.url));
const fake = await import('./fixtures/fake-firestore.mjs');
const { stopColdFollowUps } = await import('../lib/server/inbound-stop.js');

const UID = 'owner1';
fake.__seed(`sent_emails/s1`, { userId: UID, to: 'lead@example.com', followUpAt: '2026-06-05T09:00:00.000Z' });
fake.__seed(`sent_emails/s2`, { userId: UID, to: 'lead@example.com', followUpAt: null });               // already stopped: left alone
fake.__seed(`sent_emails/s3`, { userId: UID, to: 'other@example.com', followUpAt: '2026-06-05T09:00:00.000Z' });
fake.__seed(`sent_emails/s4`, { userId: 'someoneelse', to: 'lead@example.com', followUpAt: '2026-06-05T09:00:00.000Z' });

const stopped = await stopColdFollowUps(fake.__db ?? {}, UID, 'Lead@Example.com', 'inbound_enquiry', new Date('2026-06-02T10:00:00Z'));
assert.equal(stopped, 1, 'only the scheduled follow-up to this person on this account is stopped');
const s1 = fake.__all('sent_emails').find((d) => d.id === 's1');
assert.equal(s1.followUpAt, null, 'the follow-up is cancelled');
assert.equal(s1.followUpStoppedBy, 'inbound_enquiry', 'the reason is recorded');
assert.equal(fake.__all('sent_emails').find((d) => d.id === 's3').followUpAt, '2026-06-05T09:00:00.000Z', 'another person is untouched');
assert.equal(fake.__all('sent_emails').find((d) => d.id === 's4').followUpAt, '2026-06-05T09:00:00.000Z', 'another account is untouched');
assert.equal(await stopColdFollowUps({}, UID, '', 'x'), 0, 'no address, nothing to do');

console.log('inbound-stop tests: all passed');
