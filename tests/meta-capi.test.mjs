// Confirmed sign-ups to Meta: only double opt-in contacts confirmed since the last run, hashed, never unsubscribed or suppressed.
import assert from 'node:assert/strict';
import { signupsForMeta, signupsMetaBody } from '../lib/meta-capi.js';
import { hashEmail } from '../lib/consent-guard.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const since = Date.parse('2026-11-02T00:00:00Z');
const contacts = [
  { email: 'a@x.com', status: 'confirmed', confirmedAt: '2026-11-02T10:00:00Z' },
  { email: 'b@x.com', status: 'pending', confirmedAt: null },
  { email: 'c@x.com', status: 'unsubscribed', confirmedAt: '2026-11-02T10:00:00Z' },
  { email: 'd@x.com', status: 'confirmed', confirmedAt: '2026-10-01T10:00:00Z' },
  { email: 'e@x.com', status: 'confirmed', confirmedAt: '2026-11-02T11:00:00Z' },
];

t('only confirmed sign-ups confirmed since the last run are sent', () => {
  const got = signupsForMeta(contacts, { since }).map((c) => c.email).sort();
  assert.deepEqual(got, ['a@x.com', 'e@x.com']);
});

t('a suppressed address is never sent', () => {
  const got = signupsForMeta(contacts, { since, suppressed: new Set(['a@x.com']) }).map((c) => c.email);
  assert.deepEqual(got, ['e@x.com']);
});

t('the body is hashed Lead events with no address in it', () => {
  const body = signupsMetaBody(contacts, { since, eventTime: Date.UTC(2026, 10, 3) });
  assert.equal(body.data.length, 2);
  assert.equal(body.data[0].event_name, 'Lead');
  assert.equal(body.data[0].user_data.em[0], hashEmail('a@x.com'));
  assert.doesNotMatch(JSON.stringify(body), /@x\.com/);
});

console.log(`\n${n} passed`);
