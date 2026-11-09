// Stripe Connect (Pass 204): off by default; when on, the payment is taken on the owner's connected account; the owner's own keys stay the default.
import assert from 'node:assert/strict';
import { createInvoiceCheckout } from '../lib/server/payments.js';
import { authUrlFor, CONNECT_PROVIDERS } from '../lib/connect.js';
import { finishConnect } from '../lib/server/connect.js';
import { switchState, SWITCHES } from '../lib/switches.js';

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };

await t('the Stripe approval page asks for read and write access, with the app\'s return address and the state', async () => {
  const u = new URL(authUrlFor('stripe_connect', { clientId: 'ca_test', redirectUri: 'https://app.example/api/connect/callback', state: 'S' }));
  assert.equal(u.hostname, 'connect.stripe.com');
  assert.equal(u.searchParams.get('client_id'), 'ca_test');
  assert.equal(u.searchParams.get('scope'), 'read_write');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('state'), 'S');
});

await t('a failed approval exchange stops with a plain message and touches nothing', async () => {
  const r = await finishConnect(null, 'stripe_connect', { uid: 'o1', code: 'c', env: { STRIPE_PLATFORM_SECRET_KEY: 'sk_test' }, fetchImpl: async () => ({ ok: false }) });
  assert.equal(r.ok, false);
  assert.match(r.error, /Stripe did not accept/);
});

await t('the checkout is created on the connected account only when one is given', async () => {
  const calls = [];
  const stripe = { checkout: { sessions: { create: async (params, opts) => { calls.push(opts); return { url: 'https://checkout.example' }; } } } };
  const invoice = { email: 'a@x.com', number: 'INV-1', note: 'Lamp', amount: 50, total: 50, currency: 'USD' };
  await createInvoiceCheckout({ stripe, uid: 'o1', invoiceId: 'i1', invoice, currency: 'USD', origin: 'https://app.example', stripeAccount: 'acct_123' });
  await createInvoiceCheckout({ stripe, uid: 'o1', invoiceId: 'i1', invoice, currency: 'USD', origin: 'https://app.example' });
  assert.deepEqual(calls[0], { stripeAccount: 'acct_123' });
  assert.equal(calls[1], undefined, 'without a connected account the owner\'s own keys are used, as before');
});

await t('Stripe Connect is off until the owner turns it on, and needs the platform keys first', () => {
  assert.equal(SWITCHES.stripeConnect.default, false);
  assert.equal(switchState('stripeConnect', { switches: { stripeConnect: true } }, {}).status, 'needs_keys');
  assert.equal(switchState('stripeConnect', {}, { STRIPE_CONNECT_CLIENT_ID: 'ca', STRIPE_PLATFORM_SECRET_KEY: 'sk' }).status, 'off');
});

console.log(`\n${n} passed`);
