// Setup status (Pass 153): one list tells you which features are on, partly set, or off, and what each still needs.
import assert from 'node:assert/strict';
import { featureStatus, envTemplate, FEATURES } from '../lib/setup-status.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a feature is on only when every key it needs is set; partly set is shown as partial', () => {
  const rows = featureStatus({ APOLLO_API_KEY: 'k', VAPID_PUBLIC_KEY: 'a' });
  const get = (id) => rows.find((r) => r.id === id);
  assert.equal(get('apollo').status, 'on');
  assert.equal(get('push').status, 'partial');
  assert.ok(get('push').missing.includes('VAPID_PRIVATE_KEY'));
  assert.equal(get('hunter').status, 'off');
});

t('with no keys every feature is off, and nothing is reported as on', () => {
  const rows = featureStatus({});
  assert.ok(rows.every((r) => r.status === 'off'));
  assert.equal(rows.length, FEATURES.length);
});

t('the .env template lists every key once, grouped by feature, with values left blank', () => {
  const tpl = envTemplate();
  const keys = tpl.split('\n').filter((l) => /^[A-Z_]+=$/.test(l));
  assert.equal(new Set(keys).size, keys.length, 'no duplicate keys');
  assert.ok(keys.includes('APOLLO_API_KEY='));
  assert.ok(keys.includes('FORMS_OWNER_UID='));
  assert.doesNotMatch(tpl, /=\S/);
});

console.log(`\n${n} passed`);
