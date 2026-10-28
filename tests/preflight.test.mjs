import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEnv } from '../lib/preflight.js';

const full = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'x', NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'x', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'x', NEXT_PUBLIC_FIREBASE_APP_ID: 'x',
  FIREBASE_SERVICE_ACCOUNT_JSON: '{}', DEEPSEEK_API_KEY: 'x', NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'x', NEXT_PUBLIC_GOOGLE_CLIENT_SECRET: 'x',
  NEXT_PUBLIC_GOOGLE_REDIRECT_URI: 'https://app.example/api/gmail/callback', GMAIL_SENDER_EMAIL: 'me@example.com', TOKEN_ENC_KEY: 'x',
  NEXT_PUBLIC_BASE_URL: 'https://app.example', CRON_SECRET: 'x', UNSUBSCRIBE_SECRET: 'x',
};

test('a complete set of required settings passes with nothing missing', () => {
  assert.equal(checkEnv(full).missingRequired, 0);
});

test('an empty setup reports every required setting, and never echoes a value', () => {
  const r = checkEnv({});
  assert.ok(r.missingRequired >= 10);
  assert.ok(r.items.every((i) => !('value' in i)));
});

test('the base address and redirect must be https (localhost allowed for testing)', () => {
  assert.equal(checkEnv({ ...full, NEXT_PUBLIC_BASE_URL: 'http://app.example' }).missingRequired, 1);
  assert.equal(checkEnv({ ...full, NEXT_PUBLIC_BASE_URL: 'http://localhost:3000' }).missingRequired, 0);
});

test('the server login can be given as a service account or as an email and password', () => {
  const { FIREBASE_SERVICE_ACCOUNT_JSON, ...rest } = full;
  assert.equal(checkEnv({ ...rest, FIREBASE_SERVER_EMAIL: 'a@b.c', FIREBASE_SERVER_PASSWORD: 'x' }).missingRequired, 0);
  assert.equal(checkEnv(rest).missingRequired, 1);
});

test('selling needs Stripe; for your own use it does not', () => {
  assert.equal(checkEnv({ ...full, SAAS_MODE: 'on' }).missingRequired, 4);
  assert.equal(checkEnv({ ...full, SAAS_MODE: 'off' }).missingRequired, 0);
});
