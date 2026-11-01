import assert from 'node:assert/strict';
import { sign, verifyWebhook, newEndpoint, deliver, WEBHOOK_EVENTS } from '../lib/server/webhooks.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.UTC(2026, 10, 1, 12);

t('a delivery is verifiable with the endpoint secret, and changing the body or the secret breaks it', async () => {
  const secret = 'endpoint-secret';
  const body = JSON.stringify({ event: 'quote.accepted', data: { id: 'q1' } });
  const t0 = Math.floor(NOW / 1000);
  const header = `t=${t0},v1=${sign(secret, t0, body)}`;
  assert.equal(verifyWebhook({ header, body, secret, now: NOW }), true);
  assert.equal(verifyWebhook({ header, body: body.replace('q1', 'q2'), secret, now: NOW }), false);
  assert.equal(verifyWebhook({ header, body, secret: 'other', now: NOW }), false);
});

t('an old signature is refused, so a captured delivery cannot be replayed later', () => {
  const secret = 's'; const body = '{}';
  const t0 = Math.floor(NOW / 1000) - 3600;
  assert.equal(verifyWebhook({ header: `t=${t0},v1=${sign(secret, t0, body)}`, body, secret, now: NOW }), false);
});

t('only https addresses, only known events, and at least one event', () => {
  assert.match(newEndpoint({ url: 'http://x.example', events: ['quote.accepted'] }).error, /https/);
  assert.match(newEndpoint({ url: 'https://x.example', events: ['made.up'] }).error, /event/);
  const ok = newEndpoint({ url: 'https://hooks.example/abc', events: ['quote.accepted', 'quote.accepted', 'payment.received'] });
  assert.deepEqual(ok.endpoint.events, ['quote.accepted', 'payment.received']);
  assert.ok(ok.secret.length >= 40);
});

t('a delivery is one signed POST that includes the event; a failing receiver is reported, not thrown', async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => { seen.push({ url, opts }); return { ok: true, status: 200 }; };
  const r = await deliver({ endpoint: { url: 'https://hooks.example/abc' }, secret: 'k', event: 'payment.received', data: { invoice: 'INV-0001' }, fetchImpl, now: NOW });
  assert.deepEqual(r, { ok: true, status: 200 });
  assert.equal(seen[0].opts.method, 'POST');
  assert.equal(seen[0].opts.headers['X-AutoLeads-Event'], 'payment.received');
  assert.match(seen[0].opts.headers['X-AutoLeads-Signature'], /^t=\d+,v1=[0-9a-f]{64}$/);
  const bad = await deliver({ endpoint: { url: 'https://hooks.example/abc' }, secret: 'k', event: 'booking.requested', data: {}, fetchImpl: async () => { throw new Error('down'); }, now: NOW });
  assert.deepEqual(bad, { ok: false, status: 0 });
});

t('the events the app can send are the ones that matter to a sales cycle', () => {
  assert.deepEqual(WEBHOOK_EVENTS, ['quote.accepted', 'payment.received', 'booking.requested', 'booking.confirmed', 'reply.hot']);
});

console.log(`webhooks: ${n} passed`);
