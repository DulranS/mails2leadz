// Pass 302: every connected service is checked once a day, and a broken one shows on Today (spec 10.11).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { connectedServices, servicesDue, healthRecord, failingServices, HEALTH_EVERY_MS, HEALTH_CHECKS_PER_RUN } from '../lib/integration-health.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.parse('2026-11-15T06:00:00Z');
const H = 3600000;
const SERVICES = { meta_ads: ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID'], twilio_sms: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'] };

t('only services with every key saved are connected', () => {
  const vals = { META_ACCESS_TOKEN: 'x', META_AD_ACCOUNT_ID: '123', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: '' };
  assert.deepEqual(connectedServices(SERVICES, vals), ['meta_ads']);
  assert.deepEqual(connectedServices(SERVICES, {}), []);
});

t('a connected service that was never checked is due; one checked an hour ago is not', () => {
  const health = { meta_ads: { ok: true, checkedAt: new Date(NOW - H).toISOString() } };
  assert.deepEqual(servicesDue(['meta_ads', 'twilio_sms'], health, NOW), ['twilio_sms']);
  assert.deepEqual(servicesDue(['meta_ads'], health, NOW + HEALTH_EVERY_MS), ['meta_ads']);
});

t('the oldest check goes first and a run checks at most twelve', () => {
  const names = Array.from({ length: 20 }, (_, i) => `svc${i}`);
  const health = Object.fromEntries(names.map((s, i) => [s, { checkedAt: new Date(NOW - (i + 2) * 86400000).toISOString() }]));
  const due = servicesDue(names, health, NOW);
  assert.equal(due.length, HEALTH_CHECKS_PER_RUN);
  assert.equal(due[0], 'svc19');
});

t('a stored result is true or false only, with a short message and a check time', () => {
  assert.equal(healthRecord({ ok: true, message: 'Twilio account is active.' }, NOW).ok, true);
  assert.equal(healthRecord({ ok: 'yes' }, NOW).ok, false);
  assert.equal(healthRecord({ ok: false, message: 'x'.repeat(400) }, NOW).message.length, 160);
  assert.equal(healthRecord({}, NOW).message, 'Not working.');
  assert.equal(healthRecord({ ok: true }, NOW).checkedAt, new Date(NOW).toISOString());
});

t('only services whose last check failed are listed for Today', () => {
  const health = { meta_ads: { ok: false }, twilio_sms: { ok: true }, enrichment: { ok: false } };
  assert.deepEqual(failingServices(health), ['meta_ads', 'enrichment']);
  assert.deepEqual(failingServices({}), []);
});

t('the daily job checks integrations, and Today counts the failing ones', () => {
  assert.ok(fs.readFileSync('lib/server/daily-ops.js', 'utf8').includes('checkIntegrations(db, uid, { now })'));
  assert.ok(fs.readFileSync('lib/today-actions.js', 'utf8').includes("key: 'integrationsFailing'"));
  assert.ok(fs.readFileSync('lib/server/today-actions.js', 'utf8').includes('integrationsFailing: failingServices('));
});

console.log(`gap-close-302: ${n} checks passed`);
