// Pass 314: older dialled calls are linked to the customer whose phone number it was (spec 2.3, the old-calls limit).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lastDigits, phoneToEmail, callsToLink } from '../lib/call-backfill.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the same number written two ways matches on its last nine digits', () => {
  assert.equal(lastDigits('+94 77 123 4567'), lastDigits('0771234567'));
  assert.equal(lastDigits('12345'), '');
});

t('a number held by two different customers is not linked to either', () => {
  const map = phoneToEmail([
    { email: 'a@shop.com', phone: '0771234567' },
    { email: 'b@shop.com', phone: '+94771234567' },
    { email: 'c@shop.com', phone: '0779999999' },
  ]);
  assert.equal(map.has(lastDigits('0771234567')), false);
  assert.equal(map.get(lastDigits('0779999999')), 'c@shop.com');
});

t('a call with no customer is linked to the one customer with its number; others are left alone', () => {
  const links = callsToLink(
    [
      { id: 'c1', toPhone: '+94 77 123 4567' },
      { id: 'c2', toPhone: '0779999999', email: 'already@shop.com' },
      { id: 'c3', toPhone: '0700000000' },
    ],
    [{ email: 'Owner@Shop.com', phone: '0771234567' }, { email: 'c@shop.com', phone: '0779999999' }],
  );
  assert.deepEqual(links, [{ id: 'c1', email: 'owner@shop.com' }]);
});

t('a bad email in the records is ignored', () => {
  assert.equal(phoneToEmail([{ email: 'not-an-email', phone: '0771234567' }]).size, 0);
});

t('the daily job links older calls, and the link is recorded as a phone match', () => {
  const daily = fs.readFileSync('lib/server/daily-ops.js', 'utf8');
  assert.ok(daily.includes('await backfillCallEmails(db, uid)'));
  const srv = fs.readFileSync('lib/server/call-backfill.js', 'utf8');
  assert.ok(srv.includes("emailLinkedBy: 'phone_match'"));
  assert.ok(srv.includes('if (!calls.some((c) => !c.email)) return { linked: 0 };'));
});

console.log(`gap-close-314: ${n} checks passed`);
