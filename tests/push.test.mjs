// Browser push for pipeline alerts (keys switch it on; without them nothing is sent and the page says so).
import assert from 'node:assert/strict';
import { urlBase64ToUint8Array, cleanSubscription, alertPushPayload, pushKeysPresent } from '../lib/push.js';
import { sendOwnerPush } from '../lib/server/push.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the public key decodes from URL-safe base64 to the same bytes', () => {
  const bytes = Uint8Array.from([4, 250, 255, 0, 17, 200]);
  const b64url = Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.deepEqual(Array.from(urlBase64ToUint8Array(b64url)), Array.from(bytes));
});

t('a subscription is kept only with an https endpoint and both keys', () => {
  const good = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'x', auth: 'y' }, expirationTime: null };
  assert.deepEqual(cleanSubscription(good), { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'x', auth: 'y' } });
  assert.equal(cleanSubscription({ ...good, endpoint: 'http://push.example.com/abc' }), null);
  assert.equal(cleanSubscription({ endpoint: 'https://p.example', keys: { p256dh: 'x' } }), null);
  assert.equal(cleanSubscription(null), null);
});

t('the notification names counts and never a customer; nothing new means no notification', () => {
  assert.equal(alertPushPayload({}), null);
  const p = alertPushPayload({ stalled: [{}, {}], revivals: [{}], renewals: [] });
  assert.equal(p.title, 'Pipeline: 3 new alerts');
  assert.match(p.body, /2 stalled, 1 lost to look at\. Nothing has been sent to anyone\./);
  assert.equal(p.url, '/crm');
});

t('without the keys the server sends nothing and says why', async () => {
  assert.equal(pushKeysPresent({}), false);
  assert.equal(pushKeysPresent({ VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b', VAPID_SUBJECT: 'mailto:x@y.z' }), true);
  const r = await sendOwnerPush(null, 'u1', { title: 't', body: 'b', url: '/crm' }, {});
  assert.deepEqual(r, { sent: 0, skipped: 'no_keys' });
  assert.deepEqual(await sendOwnerPush(null, 'u1', null, {}), { sent: 0, skipped: 'nothing' });
});

console.log(`\n${n} passed`);
