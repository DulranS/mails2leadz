import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichOutcome } from '../lib/lead-finder.js';

const ok = (o = {}) => ({ ok: true, emails: [], phones: [], whatsapp: [], ...o });

test('each website gets one plain outcome', () => {
  assert.equal(enrichOutcome('', ok()), 'no_website');
  assert.equal(enrichOutcome('https://a.example', { ok: false, blocked: true }), 'blocked_by_robots');
  assert.equal(enrichOutcome('https://a.example', { ok: false }), 'unreachable');
  assert.equal(enrichOutcome('https://a.example', null), 'unreachable');
  assert.equal(enrichOutcome('https://a.example', ok({ emails: ['hi@a.example'] })), 'email_found');
  assert.equal(enrichOutcome('https://a.example', ok({ phones: ['94112345678'] })), 'phone_only');
  assert.equal(enrichOutcome('https://a.example', ok({ whatsapp: ['94771234567'] })), 'phone_only');
  assert.equal(enrichOutcome('https://a.example', ok()), 'no_contact_on_site');
});
