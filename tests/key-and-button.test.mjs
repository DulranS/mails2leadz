// One key and a button (Pass 203): Typeform's webhooks are set up from one token; Slack alerts come from one approval; the secrets stay the app's to make.
import assert from 'node:assert/strict';
import { typeformWebhookBody, formIdsFrom } from '../lib/typeform-connect.js';
import { slackWebhookFrom } from '../lib/server/slack-connect.js';
import { CONNECT_PROVIDERS } from '../lib/connect.js';
import { SECRET_NAMES } from '../lib/server/integration-secrets.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a Typeform webhook is set to the owner\'s address, with the app\'s secret, checked over TLS', () => {
  const b = typeformWebhookBody('https://app.example/api/intake?id=x&p=typeform', 'secret1');
  assert.equal(b.secret, 'secret1');
  assert.equal(b.verify_ssl, true);
  assert.equal(b.enabled, true);
});

t('only real form ids are used, and no more than five forms', () => {
  const ids = formIdsFrom({ items: [{ id: 'abc123' }, { id: 'bad id!' }, { id: 'def456' }, { id: 'g1h2i3' }, { id: 'j4k5l6' }, { id: 'm7n8o9' }, { id: 'p1q2r3' }] });
  assert.equal(ids.length, 5);
  assert.ok(!ids.includes('bad id!'));
});

t('Slack gives an incoming-webhook address only on a real Slack approval; anything else is refused', () => {
  assert.equal(slackWebhookFrom({ ok: true, incoming_webhook: { url: 'https://hooks.slack.com/services/T/B/x' } }), 'https://hooks.slack.com/services/T/B/x');
  assert.equal(slackWebhookFrom({ ok: true, incoming_webhook: { url: 'https://evil.example/x' } }), null);
  assert.equal(slackWebhookFrom({ ok: false }), null);
});

t('Slack is a button, and its channel address is one of the stored settings', () => {
  assert.match(CONNECT_PROVIDERS.slack.scope, /incoming-webhook/);
  assert.equal(CONNECT_PROVIDERS.slack.stores.length, 0, 'the channel address lives in the business settings, not the key store');
});

console.log(`\n${n} passed`);
