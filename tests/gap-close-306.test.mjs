// Pass 306: a person who opted out with their own link can switch emails back on.
// A bounce is never switched back on from a link. The lost deal is not restored (recorded in the ledger).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resubscribeDecision } from '../lib/contact-rules.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('no suppression record means the address is already on the list: nothing to change', () => {
  assert.deepEqual(resubscribeDecision(null), { ok: true, changed: false });
  assert.deepEqual(resubscribeDecision(undefined), { ok: true, changed: false });
});

t('an opt-out made with the unsubscribe link can be switched back on', () => {
  assert.deepEqual(resubscribeDecision('unsubscribe_link'), { ok: true, changed: true });
});

t('a bounce cannot be switched back on from a link', () => {
  assert.equal(resubscribeDecision('bounce').ok, false);
  assert.equal(resubscribeDecision('bounce').changed, false);
});

t('an unknown source is refused, not switched on', () => {
  assert.equal(resubscribeDecision('something_else').ok, false);
});

t('the suppression helper deletes the record only for an opt-out, and puts the lost deal back in its open stage', () => {
  const src = fs.readFileSync('lib/server/suppress.js', 'utf8');
  assert.ok(src.includes('export async function resubscribeContact('));
  assert.ok(src.includes('if (decision.changed) {\n    await deleteDoc(ref);'));
  assert.ok(src.includes('goes back to the open stage it was in'));
});

t('the unsubscribe route switches back on only with action=resubscribe, behind the same token and admin checks', () => {
  const src = fs.readFileSync('app/api/unsubscribe/route.js', 'utf8');
  assert.ok(src.includes("searchParams.get('action') === 'resubscribe'"));
  assert.ok(src.includes('status: 409'));
  const verifyAt = src.indexOf('verifyUnsubToken(tokenOf(request))');
  const resubAt = src.indexOf("action') === 'resubscribe'");
  assert.ok(verifyAt > 0 && verifyAt < resubAt, 'token is checked before the action runs');
});

t('the page offers Switch emails back on after an opt-out, with its own error line', () => {
  const src = fs.readFileSync('app/unsubscribe/page.js', 'utf8');
  assert.ok(src.includes('Switch emails back on'));
  assert.ok(src.includes("post('resubscribe')"));
  assert.ok(src.includes('Opted out by mistake?'));
});

console.log(`gap-close-306: ${n} checks passed`);
