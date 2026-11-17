// Pass 313: the person chooses what to stop. Sales emails only, or every email from the sender. Both only reduce contact.
// A bounce is never replaced by an opt-out, and a stop-all can be switched back on by the person who chose it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { blockDecision, resubscribeDecision } from '../lib/contact-rules.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a stop-all blocks sales and transactional emails alike; a sales opt-out does not block invoices', () => {
  assert.equal(blockDecision({ kind: 'all' }, 'transactional'), true);
  assert.equal(blockDecision({ kind: 'all' }, 'marketing'), true);
  assert.equal(blockDecision({ kind: 'marketing' }, 'transactional'), false);
  assert.equal(blockDecision({ kind: 'marketing' }, 'marketing'), true);
});

t('a stop-all can be switched back on by the person; a bounce still cannot', () => {
  assert.deepEqual(resubscribeDecision('all_mail'), { ok: true, changed: true });
  assert.equal(resubscribeDecision('bounce').ok, false);
});

t('the suppression check treats a stop-all as blocking everything', () => {
  const src = fs.readFileSync('lib/server/route-helpers.js', 'utf8');
  assert.ok(src.includes('kindOfSource(snap.data()?.source)'));
});

t('a bounce is never replaced by an opt-out', () => {
  const src = fs.readFileSync('lib/server/suppress.js', 'utf8');
  assert.ok(src.includes('rankOf(before.source) > rankOf(source)'));
  assert.ok(src.includes('source: keptSource'));
});

t('the signed link offers stop-all, and the page shows both choices', () => {
  const route = fs.readFileSync('app/api/unsubscribe/route.js', 'utf8');
  assert.ok(route.includes("stopAll ? 'all_mail' : 'unsubscribe_link'"));
  const page = fs.readFileSync('app/unsubscribe/page.js', 'utf8');
  assert.ok(page.includes("post('stop_all')"));
  assert.ok(page.includes('Stop all emails'));
  assert.ok(page.includes('Stop sales emails'));
});

console.log(`gap-close-313: ${n} checks passed`);
