// Pass 345: the data-request deadline (the earlier of 21 working days and one month), the breach 72-hour rule from the DPA's draft rules,
// the people-notice prompt, candidate profiles with no email (CV rule and name review on erasure), and the wiring of each screen.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addOneMonth, deadlineFor, sanitizeRequest, DEADLINE_WORKING_DAYS } from '../lib/data-requests.js';
import { sanitizeBreach, authorityDueAt, breachState, peopleNoticePending, AUTHORITY_HOURS, dateTimeOrNull } from '../lib/breach-register.js';
import { unlinkedCandidates } from '../lib/erase-contact.js';
import { cvPatch } from '../lib/candidates.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const HOUR = 3600000;

t('the working-day rule is still 21 days', () => assert.equal(DEADLINE_WORKING_DAYS, 21));
t('a one-month rule clamps to the end of a shorter month', () => assert.equal(addOneMonth('2026-01-31'), '2026-02-28'));
t('the earlier of the two rules is used: 21 working days when it is earlier', () => assert.equal(deadlineFor('2026-11-19'), '2026-12-18'));
t('the earlier of the two rules is used: one month when it is earlier', () => assert.equal(deadlineFor('2027-01-29'), '2027-02-28'));
t('a request sets its answer-by date with the same rule', () => assert.equal(sanitizeRequest({ name: 'Ann', receivedOn: '2027-01-29' }).dueOn, '2027-02-28'));

t('a time typed in Sri Lanka time is kept as that instant', () => assert.equal(dateTimeOrNull('2026-11-18T09:00'), '2026-11-18T03:30:00.000Z'));
t('a breach keeps its discovery time and date in Sri Lanka time', () => {
  const b = sanitizeBreach({ description: 'x', discoveredAt: '2026-11-18T00:30' });
  assert.equal(b.discoveredAt, '2026-11-17T19:00:00.000Z');
  assert.equal(b.discoveredOn, '2026-11-18');
});
t('the Authority is due 72 hours after discovery', () => {
  const b = sanitizeBreach({ description: 'x', discoveredAt: '2026-11-18T09:00', dataAffected: 'yes' });
  assert.equal(AUTHORITY_HOURS, 72);
  assert.equal(authorityDueAt(b), new Date(Date.parse('2026-11-18T03:30:00.000Z') + 72 * HOUR).toISOString());
});
t('before the 72 hours: decision; at or after: overdue', () => {
  const b = sanitizeBreach({ description: 'x', discoveredAt: '2026-11-18T09:00', dataAffected: 'yes' });
  const due = Date.parse(authorityDueAt(b));
  assert.equal(breachState(b, new Date(due - HOUR).toISOString()), 'authority_decision');
  assert.equal(breachState(b, new Date(due).toISOString()), 'authority_overdue');
});
t('a recorded Authority date takes the breach out of the notice states', () => {
  const b = { ...sanitizeBreach({ description: 'x', discoveredAt: '2026-11-18T09:00', dataAffected: 'yes' }), authorityNotifiedOn: '2026-11-19' };
  assert.equal(breachState(b, '2026-11-25T00:00:00.000Z'), 'review');
  assert.equal(breachState({ ...b, authorityNotifiedOn: undefined }, '2026-11-18T10:00:00.000Z'), 'authority_decision');
});
t('the people are to be told at the same time: pending while personal data is affected and they are not yet told', () => {
  const b = sanitizeBreach({ description: 'x', discoveredAt: '2026-11-18T09:00', dataAffected: 'yes' });
  assert.equal(peopleNoticePending(b), true);
  assert.equal(peopleNoticePending({ ...b, peopleNotifiedOn: '2026-11-19' }), false);
  assert.equal(peopleNoticePending({ ...b, dataAffected: 'no' }), false);
  assert.equal(peopleNoticePending({ ...b, status: 'closed' }), false);
});
t('an open breach with no personal data is reviewed after 72 hours, not sooner', () => {
  const old = sanitizeBreach({ description: 'x', discoveredAt: '2026-11-15T09:00', dataAffected: 'no' });
  const fresh = sanitizeBreach({ description: 'x', discoveredAt: '2026-11-19T09:00', dataAffected: 'no' });
  assert.equal(breachState(old, '2026-11-20T00:00:00.000Z'), 'review');
  assert.equal(breachState(fresh, '2026-11-20T00:00:00.000Z'), 'open');
});

t('candidates with no email are matched by name, ignoring case and spacing', () => {
  const list = [
    { id: 'a', name: 'Jane  Doe', email: '', stage: 'shortlisted' },
    { id: 'b', name: 'Jane Doe', email: 'jane@example.com' },
    { id: 'c', name: 'John Doe', email: '' },
  ];
  assert.deepEqual(unlinkedCandidates(list, ' jane doe '), [{ id: 'a', name: 'Jane  Doe', stage: 'shortlisted' }]);
  assert.deepEqual(unlinkedCandidates(list, ''), []);
});
t('a profile whose email is not valid counts as having no email', () => {
  assert.equal(unlinkedCandidates([{ id: 'x', name: 'Ann', email: 'not-an-email' }], 'Ann').length, 1);
});

t('a CV needs a valid email on the profile', () => {
  assert.ok(cvPatch('CV text', new Date(), '').error);
  assert.ok(cvPatch('CV text', new Date(), 'bad').error);
  assert.equal(cvPatch('CV text', new Date(), 'ann@example.com').cv, 'CV text');
  assert.deepEqual(cvPatch('', new Date(), ''), { cv: '', cvAddedAt: null });
});

t('the data-request screen says the earlier of the two rules', () => {
  assert.ok(read('../app/data-requests/page.js').includes('the earlier of'));
});
t('erasure lists email-less candidates by name and does not delete them', () => {
  const src = read('../lib/server/erase-contact.js');
  assert.ok(src.includes('reviewCandidates'));
  assert.ok(src.includes('were not erased'));
  assert.ok(src.includes("collection(db, 'users', uid, 'candidates')"));
});
t('the erase route and the erase form pass the name through', () => {
  assert.ok(read('../app/api/contacts/erase/route.js').includes("name: String(body?.name"));
  const pd = read('../app/components/PersonData.js');
  assert.ok(pd.includes('id="pd-name"'));
  assert.ok(pd.includes('name, confirm: typed'));
});
t('the candidates screen gives a CV the email and warns about profiles with none', () => {
  const src = read('../app/candidates/page.js');
  assert.ok(src.includes('saveCv(r.id, cvDraft, r.email)'));
  assert.ok(src.includes('No email: an erasure or access request cannot find this profile'));
});
t('the breach screen shows the Authority deadline and the people-notice button', () => {
  const src = read('../app/breaches/page.js');
  assert.ok(src.includes('Record people told'));
  assert.ok(src.includes('type="datetime-local"'));
  assert.ok(src.includes('Decide, with your adviser'));
});

console.log(`gap-close-345: ${n} checks passed`);
