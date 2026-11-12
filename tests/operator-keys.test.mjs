// App keys (Pass 230): only operator keys can be set in the app; bootstrap values never can; without app-set keys the server settings are used as before.
import assert from 'node:assert/strict';
import { OPERATOR_KEYS, operatorEnv } from '../lib/server/operator-settings.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('bootstrap values (database credentials, the encryption key, the admin list) cannot be set in the app', () => {
  for (const k of ['FIREBASE_PRIVATE_KEY', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'TOKEN_ENC_KEY', 'ADMIN_EMAILS', 'CRON_SECRET']) {
    assert.ok(!OPERATOR_KEYS.includes(k), k);
  }
});

t('the keys that sign people in and connect apps can be set in the app', () => {
  for (const k of ['NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'NEXT_PUBLIC_GOOGLE_CLIENT_SECRET', 'EBAY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'STRIPE_PLATFORM_SECRET_KEY', 'ANTHROPIC_API_KEY']) {
    assert.ok(OPERATOR_KEYS.includes(k), k);
  }
});

t('with nothing set in the app, the server settings are what the app uses', () => {
  const env = operatorEnv({ EBAY_CLIENT_ID: 'from-server' });
  assert.equal(env.EBAY_CLIENT_ID, 'from-server');
});

console.log(`\n${n} passed`);
