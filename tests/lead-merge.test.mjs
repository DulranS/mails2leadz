// Duplicate leads: finding likely duplicates, and combining two leads without losing the owner's work.
import assert from 'node:assert/strict';
import { duplicateReasons, findDuplicatesOf, mergedStage, mergedDealFields } from '../lib/lead-merge.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const a = { email: 'ana@shop.lk', business: 'Ana Tailors', phone: '0771234567', website: 'https://www.anatailors.lk' };

t('the same phone in two formats (0771… and +94771…) is a duplicate', () => {
  const b = { email: 'info@other.lk', business: 'Different', phone: '+94 77 123 4567' };
  assert.deepEqual(duplicateReasons(a, b), ['same phone']);
});

t('the same website (www or not) is a duplicate', () => {
  const b = { email: 'hello@x.lk', business: 'X', website: 'anatailors.lk' };
  assert.deepEqual(duplicateReasons(a, b), ['same website']);
});

t('the same business name, ignoring case and punctuation, is a duplicate', () => {
  const b = { email: 'sales@y.lk', business: 'ana  tailors!' };
  assert.deepEqual(duplicateReasons(a, b), ['same business name']);
});

t('a lead is never a duplicate of itself, and the same email with different case is not a second lead', () => {
  assert.deepEqual(duplicateReasons(a, { ...a }), []);
  assert.deepEqual(duplicateReasons(a, { ...a, email: 'ANA@shop.lk' }), []);
});

t('an unrelated lead is not a duplicate; a very short name is not matched on its own', () => {
  assert.deepEqual(duplicateReasons(a, { email: 'z@z.lk', business: 'Kandy Print', phone: '0112345678' }), []);
  assert.deepEqual(duplicateReasons({ email: 'a@a.lk', business: 'Abc' }, { email: 'b@b.lk', business: 'ABC' }), []);
});

t('findDuplicatesOf returns each matching lead with its reasons, not the target', () => {
  const leads = [a, { email: 'x@x.lk', business: 'Ana Tailors', phone: '0771234567' }, { email: 'q@q.lk', business: 'Other' }];
  const found = findDuplicatesOf(a, leads);
  assert.equal(found.length, 1);
  assert.equal(found[0].lead.email, 'x@x.lk');
  assert.deepEqual(found[0].reasons.sort(), ['same business name', 'same phone'].sort());
});

t('merged stage: a win beats everything; a closed keep stays closed; otherwise the further open stage wins', () => {
  assert.equal(mergedStage('proposal', 'closed_won'), 'closed_won');
  assert.equal(mergedStage('closed_won', 'demo'), 'closed_won');
  assert.equal(mergedStage('closed_lost', 'demo'), 'closed_lost');
  assert.equal(mergedStage('demo', 'proposal'), 'proposal');
  assert.equal(mergedStage('negotiation', 'new'), 'negotiation');
});

t('merged deal keeps the owner’s value and fills a blank value from the duplicate', () => {
  const m = mergedDealFields({ stage: 'demo', value: 5000 }, { stage: 'new', value: 9000 });
  assert.equal(m.value, 5000);
  const m2 = mergedDealFields({ stage: 'demo' }, { stage: 'new', value: 9000 });
  assert.equal(m2.value, 9000);
});

t('merged deal joins notes and tags, without duplicate tags', () => {
  const m = mergedDealFields(
    { stage: 'new', tags: ['vip', 'kandy'], notes: [{ text: 'call Monday' }] },
    { stage: 'new', tags: ['vip', 'retail'], notes: [{ text: 'sent deck' }] },
  );
  assert.deepEqual(m.tags.sort(), ['kandy', 'retail', 'vip']);
  assert.equal(m.notes.length, 2);
});

t('merged qualification: the owner’s answer wins, a blank is filled, and committee members are not counted twice', () => {
  const m = mergedDealFields(
    { stage: 'new', qualification: { budget: 'yes', committee: [{ name: 'Ravi', role: 'economic_buyer' }] } },
    { stage: 'new', qualification: { budget: 'no', need: 'yes', committee: [{ name: 'ravi', role: 'champion' }, { name: 'Dilini', role: 'champion' }] } },
  );
  assert.equal(m.qualification.budget, 'yes');
  assert.equal(m.qualification.need, 'yes');
  assert.deepEqual(m.qualification.committee.map((x) => x.name), ['Ravi', 'Dilini']);
});

t('a merge with no deal on either side still gives a valid open stage', () => {
  const m = mergedDealFields(null, null);
  assert.equal(m.stage, 'new');
  assert.deepEqual(m.tags, []);
});

console.log(`lead-merge: ${n} passed`);
