import assert from 'node:assert/strict';
import { hardBounceRecipients } from '../lib/server/bounces.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const ours = ['bob@acme.com', 'amy@shop.io', 'Zed@Corp.com'];
t('"address not found" names the recipient', () => {
  assert.deepEqual(hardBounceRecipients("Address not found Your message wasn't delivered to bob@acme.com because the address couldn't be found, or is unable to receive mail.", ours), ['bob@acme.com']);
});
t('matches regardless of case, ignores people we never emailed', () => {
  assert.deepEqual(hardBounceRecipients('550 5.1.1 zed@corp.com user unknown. Also stranger@x.com', ours), ['zed@corp.com']);
});
t('soft failures never suppress: full mailbox, spam block, temporary error', () => {
  assert.deepEqual(hardBounceRecipients("Your message wasn't delivered to bob@acme.com because the recipient's inbox is full.", ours), []);
  assert.deepEqual(hardBounceRecipients('bob@acme.com rejected your message as spam (5.7.1)', ours), []);
  assert.deepEqual(hardBounceRecipients('Delivery to amy@shop.io was delayed, will keep trying', ours), []);
});
t('empty or irrelevant text is safe', () => {
  assert.deepEqual(hardBounceRecipients('', ours), []);
  assert.deepEqual(hardBounceRecipients(null, ours), []);
  assert.deepEqual(hardBounceRecipients('address not found for someone@else.com', ours), []);
});
console.log(`\n${n} passed`);
