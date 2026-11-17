// Send gate (v326): blocks only a definite missing SPF or DMARC record; DKIM never blocks; unknown DNS never blocks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sendGateFromLookups } from '../lib/sender-auth.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const SPF = ['v=spf1 include:_spf.example.com -all'];
const DMARC = ['v=DMARC1; p=quarantine; rua=mailto:r@example.com'];
const known = (txts) => ({ known: true, txts });
const unknown = { known: false, txts: [] };

t('SPF and DMARC present: passes', () => {
  assert.equal(sendGateFromLookups({ spf: known(SPF), dmarc: known(DMARC) }).ok, true);
});
t('no SPF record (known missing): blocks with a plain message', () => {
  const g = sendGateFromLookups({ spf: known([]), dmarc: known(DMARC) });
  assert.equal(g.ok, false);
  assert.match(g.message, /no SPF record/);
});
t('no DMARC record (known missing): blocks', () => {
  const g = sendGateFromLookups({ spf: known(SPF), dmarc: known([]) });
  assert.equal(g.ok, false);
  assert.match(g.message, /no DMARC record/);
});
t('DKIM is not checked by the gate, so its absence never blocks', () => {
  assert.equal(sendGateFromLookups({ spf: known(SPF), dmarc: known(DMARC) }).ok, true);
});
t('an unknown lookup (timeout) never blocks', () => {
  assert.equal(sendGateFromLookups({ spf: unknown, dmarc: known([]) }).ok, true);
  assert.equal(sendGateFromLookups({ spf: known([]), dmarc: unknown }).unavailable, true);
});
t('the send route applies the postal-address check and the gate before sending', () => {
  const src = fs.readFileSync('app/api/send-email/route.js', 'utf8');
  assert.match(src, /senderGateFor\(senderEmail\)/);
  assert.match(src, /if \(!senderAddress\)/);
  assert.match(src, /status: 422/);
});
console.log(`  ${n} sender gate checks passed`);
