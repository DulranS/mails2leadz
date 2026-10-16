import assert from 'node:assert/strict';
import { computeOnboarding } from '../lib/onboarding.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a brand-new account starts at 0% and is pointed at the first thing that unlocks value', () => {
  const o = computeOnboarding({});
  assert.equal(o.percent, 0); assert.equal(o.complete, false); assert.equal(o.next.id, 'profile');
  assert.equal(o.doneCount, 0); assert.equal(o.total, 7);
});

t('steps are ordered by what unlocks value; the next step skips optional ones until required are done', () => {
  assert.equal(computeOnboarding({ profile: true }).next.id, 'leads');
  assert.equal(computeOnboarding({ profile: true, leads: true }).next.id, 'send');
  assert.equal(computeOnboarding({ profile: true, leads: true, sent: true }).next.id, 'reply'); // enquiry link / kit are optional: not "next"
  assert.equal(computeOnboarding({ profile: true, leads: true, sent: true, replied: true }).next.id, 'win');
});

t('optional steps do not hold the bar back, and finishing the required ones completes it', () => {
  const o = computeOnboarding({ profile: true, leads: true, sent: true, replied: true, won: true });
  assert.deepEqual([o.percent, o.complete, o.doneCount], [100, true, 5]);
  assert.equal(o.next.id, 'enquiry'); // an optional step is still offered once nothing required is left
  assert.equal(computeOnboarding({ enquiryLink: true, kit: true }).percent, 0);
});

t('every step says where to go', () => { assert.ok(computeOnboarding({}).steps.every((s) => s.href.startsWith('/') && s.label && s.help)); });

console.log(`${n} onboarding tests passed`);
