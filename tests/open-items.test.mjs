// Open items (Pass 269): Twilio requests are accepted only with a valid signature; red flags come from the numbers; the Do now list carries the new counts.
import assert from 'node:assert/strict';
import { twilioSignature, validTwilioRequest } from '../lib/twilio-signature.js';
import { salesRedFlags } from '../lib/sales-red-flags.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const DAY = 86400000, now = Date.parse('2026-11-14T12:00:00Z');
const url = 'https://example.com/api/twilio/missed-call/u1';
const params = { CallStatus: 'no-answer', From: '+94771234567' };

t('a request signed with the auth token is accepted; a tampered one or a wrong token is refused', () => {
  const sig = twilioSignature(url, params, 'secret-token');
  assert.equal(validTwilioRequest(url, params, 'secret-token', sig), true);
  assert.equal(validTwilioRequest(url, { ...params, CallStatus: 'completed' }, 'secret-token', sig), false);
  assert.equal(validTwilioRequest(url, params, 'other-token', sig), false);
  assert.equal(validTwilioRequest(url, params, 'secret-token', ''), false);
});

t('a falling won value and a large share of old unpaid bills are flagged; a healthy record is not', () => {
  const won = (daysAgo, value) => ({ stage: 'closed_won', value, stageTimes: { closed_won: new Date(now - daysAgo * DAY).toISOString() } });
  const falling = salesRedFlags({ now, deals: [won(10, 500), won(120, 1000)] });
  assert.ok(falling.some((f) => f.id === 'wonFalling'));
  const old = salesRedFlags({ now, deals: [won(10, 1000), won(120, 1000)], invoices: [
    { status: 'sent', total: 900, dueDate: new Date(now - 60 * DAY).toISOString() },
    { status: 'paid', total: 100 },
  ] });
  assert.ok(old.some((f) => f.id === 'overdueShare'));
  assert.deepEqual(salesRedFlags({ now, deals: [won(10, 1000), won(120, 900)], invoices: [{ status: 'paid', total: 100 }] }), []);
});

console.log(`\n${n} passed`);
