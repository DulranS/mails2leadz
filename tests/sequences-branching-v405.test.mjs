// Sequences (pass 405): branch steps (wait, then a reply decides the next step), call and text steps as tasks for the owner.
// Pure modules only: the Firestore runners need installed packages and are checked by parse and in a browser later.
import assert from 'node:assert/strict';
import { parseJourney, checkJourney, dueStep, journeyActions } from '../lib/journey.js';
import { resolveEnrolmentPosition, checkBranches } from '../lib/journey-branch.js';
import { planJourneyTask, journeyTask } from '../lib/journey-tasks.js';
import { contactReplied } from '../lib/journey-replies.js';
import { tasksView } from '../lib/task-rules.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000, now = Date.parse('2026-11-26T09:00:00Z');
const at = (days) => new Date(now - days * DAY).toISOString();

const straight = '0 | email | Thanks for getting in touch.\n3 | email | Did you get a chance to look?\n7 | email | Anything unclear?';
const branching = [
  '0 | email | Thanks for getting in touch.',   // step 1
  '3 | branch | if replied | yes 3 | no 4',      // step 2: after 3 days, replied to step 3, else step 4
  '1 | email | Thank you for replying. Shall we book a call?', // step 3 (replied path)
  '2 | email | Did you get a chance to look?',   // step 4 (no-reply path)
].join('\n');

t('a straight sequence still reads and validates, with no branch', () => {
  const p = parseJourney(straight);
  assert.equal(p.steps.length, 3);
  assert.equal(p.skipped, 0);
  assert.deepEqual(checkJourney(p), { ok: true });
  assert.deepEqual(p.steps[1], { waitDays: 3, channel: 'email', text: 'Did you get a chance to look?' });
});

t('a branch with a missing target is refused, and the error names the step', () => {
  const p = parseJourney('0 | email | Thanks for getting in touch.\n3 | branch | if replied | yes 3 | no 9\n4 | email | Last note here');
  const r = checkJourney(p);
  assert.equal(r.ok, false);
  assert.match(r.error, /step 9/);
  assert.match(r.error, /does not exist/);
});

t('a branch that is written badly is refused rather than silently dropped', () => {
  const r = checkJourney(parseJourney('0 | email | Thanks for getting in touch.\n3 | branch | if replied | yes 3 | maybe 4\n4 | email | Last note here'));
  assert.equal(r.ok, false);
  assert.match(r.error, /could not be read/);
});

t('a loop is refused: a branch cannot point back, or at itself', () => {
  const back = checkJourney(parseJourney('0 | email | Thanks for getting in touch.\n3 | email | Second message here\n2 | branch | if replied | yes 1 | no 3'));
  assert.equal(back.ok, false);
  assert.match(back.error, /points back to step 1/);
  assert.match(back.error, /loop/);
  const self = checkBranches([{ waitDays: 0, channel: 'email', text: 'Hello there' }, { waitDays: 1, channel: 'branch', condition: 'replied', yes: 2, no: 3 }, { waitDays: 1, channel: 'email', text: 'Hello again' }]);
  assert.equal(self.ok, false);
  assert.match(self.error, /itself/);
});

t('a branch cannot be the first step, and "end" is a valid target', () => {
  assert.equal(checkJourney(parseJourney('0 | branch | if replied | yes 2 | no 2\n3 | email | Hello again there')).ok, false);
  assert.deepEqual(checkJourney(parseJourney('0 | email | Thanks for getting in touch.\n3 | branch | if replied | yes end | no 3\n2 | email | Did you look?')), { ok: true });
});

t('the branch picks the replied path when there was a reply, and the no-reply path when there was not', () => {
  const journey = { id: 'j1', steps: parseJourney(branching).steps };
  const replied = { id: 'e1', journeyId: 'j1', stepIndex: 1, lastStepAt: at(4), replied: true, enrolledAt: at(5) };
  const silent = { ...replied, replied: false };
  const rp = resolveEnrolmentPosition(replied, journey, now);
  assert.equal(rp.stepIndex, 2, 'replied goes to step 3');
  assert.equal(rp.branchLog[0].outcome, 'replied');
  assert.equal(rp.changed, true);
  const sp = resolveEnrolmentPosition(silent, journey, now);
  assert.equal(sp.stepIndex, 3, 'no reply goes to step 4');
  assert.equal(sp.branchLog[0].outcome, 'no_reply');
  // The decision is saved at its time (now); the step it sends to then waits its own days: replied path 1 day, no-reply path 2 days.
  const savedReplied = { ...replied, stepIndex: rp.stepIndex, lastStepAt: rp.lastStepAt, routedTo: rp.routedTo };
  const savedSilent = { ...silent, stepIndex: sp.stepIndex, lastStepAt: sp.lastStepAt, routedTo: sp.routedTo };
  assert.equal(dueStep(savedReplied, journey, now), null, 'the replied email waits its day after the decision');
  assert.equal(dueStep(savedReplied, journey, now + DAY).text, 'Thank you for replying. Shall we book a call?');
  assert.equal(dueStep(savedSilent, journey, now + 2 * DAY).text, 'Did you get a chance to look?');
});

t('a branch waits its days first: before then nothing is due and nothing is decided', () => {
  const journey = { id: 'j1', steps: parseJourney(branching).steps };
  const early = { id: 'e1', journeyId: 'j1', stepIndex: 1, lastStepAt: at(1), replied: true };
  const pos = resolveEnrolmentPosition(early, journey, now);
  assert.equal(pos.stepIndex, 1);
  assert.equal(pos.changed, false);
  assert.equal(dueStep(early, journey, now), null);
});

t('a reply stops the next plain step, but not the step a branch sent the person to', () => {
  const journey = { id: 'j1', steps: parseJourney(branching).steps };
  // Branch already routed the replied person to step 3 (index 2): that send goes out.
  assert.equal(dueStep({ id: 'e1', journeyId: 'j1', stepIndex: 2, routedTo: 2, replied: true, lastStepAt: at(2) }, journey, now).stepIndex, 2);
  // After that send, the next plain step is stopped by the reply.
  assert.equal(dueStep({ id: 'e1', journeyId: 'j1', stepIndex: 3, routedTo: 2, replied: true, lastStepAt: at(2) }, journey, now), null);
  const ended = resolveEnrolmentPosition({ id: 'e1', journeyId: 'j1', stepIndex: 3, routedTo: 2, replied: true, lastStepAt: at(2) }, journey, now);
  assert.equal(ended.done, true);
  assert.equal(ended.endedBy, 'reply');
});

t('a contact on both branches over time: each branch decides once, and the log keeps each decision', () => {
  const journey = { id: 'j2', steps: parseJourney('0 | email | Thanks for getting in touch.\n2 | branch | if replied | yes 5 | no 3\n2 | email | Did you get a chance to look?\n2 | branch | if replied | yes 5 | no 6\n1 | email | Thank you for replying. Shall we talk?\n2 | email | Last note from us.').steps };
  // Branch 1 (step 2): no reply by then, so the person goes to step 3 (index 2). The log keeps that decision.
  const b1 = resolveEnrolmentPosition({ id: 'e2', journeyId: 'j2', stepIndex: 1, lastStepAt: at(2), replied: false }, journey, now);
  assert.equal(b1.stepIndex, 2);
  assert.equal(b1.branchLog[0].outcome, 'no_reply');
  // Step 3 is sent; the person replies to it; branch 2 (step 4) now sees the reply and goes to step 5 (index 4).
  const b2 = resolveEnrolmentPosition({ id: 'e2', journeyId: 'j2', stepIndex: 3, lastStepAt: at(2), replied: true, routedTo: 2, branchLog: b1.branchLog }, journey, now);
  assert.equal(b2.stepIndex, 4);
  assert.equal(b2.branchLog.length, 1, 'only the new decision is returned; the saved log keeps the earlier one');
  assert.equal(b2.branchLog[0].outcome, 'replied');
  assert.equal(b2.done, false, 'the replied step is routed by a branch, so the reply does not stop it');
});

t('a plain step with no branch behind it: an unreplied journey still sends in order', () => {
  const journey = { id: 'j3', steps: parseJourney(straight).steps };
  assert.equal(dueStep({ id: 'x', journeyId: 'j3', stepIndex: 1, lastStepAt: at(4) }, journey, now).stepIndex, 1);
  assert.equal(journeyActions([{ id: 'x', journeyId: 'j3', stepIndex: 1, lastStepAt: at(4) }], [{ id: 'j3', name: 'Welcome', steps: journey.steps }], now).length, 1);
});

t('a call step makes a call task with the right fields', () => {
  const due = { channel: 'call', email: 'ann@x.com', text: 'Ask about the quote and the delivery date.', journey: 'Onboarding', stepIndex: 1, total: 3, enrolmentId: 'e9' };
  const plan = planJourneyTask({ enrolment: { id: 'e9', journeyId: 'j1', consentConfirmedAt: at(1) }, due, phone: '+94 77 000 0000', now, offsetMin: 330 });
  assert.equal(plan.action, 'task');
  const task = plan.task;
  assert.equal(task.kind, 'call');
  assert.equal(task.title, 'Call ann@x.com (Onboarding, step 2 of 3)');
  assert.equal(task.contact, 'ann@x.com');
  assert.equal(task.phone, '+94 77 000 0000');
  assert.equal(task.note, 'Ask about the quote and the delivery date.');
  assert.equal(task.draft, '', 'a call task has no draft text');
  assert.equal(task.dueDate, '2026-11-26', 'due on the owner\'s day, UTC+5:30 at 09:00 UTC is the same day');
  assert.equal(task.done, false);
  assert.equal(task.assignedTo, '');
  assert.equal(task.journeyId, 'j1');
  assert.equal(task.enrolmentId, 'e9');
});

t('an SMS step stores the draft on the task, to be sent from the owner\'s phone', () => {
  const draft = 'Hi Ann, did you get a chance to look at the proposal?';
  const plan = planJourneyTask({ enrolment: { id: 'e8', journeyId: 'j1', consentConfirmedAt: at(1) }, due: { channel: 'sms', email: 'ann@x.com', text: draft, journey: 'Onboarding', stepIndex: 2, total: 3, enrolmentId: 'e8' }, now });
  assert.equal(plan.action, 'task');
  assert.equal(plan.task.kind, 'sms');
  assert.equal(plan.task.draft, draft);
  assert.equal(plan.task.note, '');
  assert.match(plan.task.title, /^Text ann@x\.com/);
  assert.equal(plan.task.phone, '', 'no number on file is allowed; the task still goes out');
});

t('a call or text step waits for consent, like automatic email, and a do-not-contact person gets no task', () => {
  const due = { channel: 'sms', email: 'ann@x.com', text: 'Hi there, quick one', journey: 'Onboarding', stepIndex: 0, total: 2, enrolmentId: 'e7' };
  assert.equal(planJourneyTask({ enrolment: { id: 'e7' }, due, now }).why, 'no_agreement_recorded');
  assert.equal(planJourneyTask({ enrolment: { id: 'e7', consentConfirmedAt: at(1) }, due, blocked: true, now }).action, 'do_not_contact');
});

t('tasks view shows the draft and the note, and a plain task still reads the same', () => {
  const rows = tasksView([
    { id: 'tk1', title: 'Text ann@x.com', dueDate: '2026-11-26', kind: 'sms', draft: 'Hi Ann', phone: '+94 77' },
    { id: 'tk2', title: 'Plain task', dueDate: '2026-11-27' },
  ], now, 0);
  assert.equal(rows[0].draft, 'Hi Ann');
  assert.equal(rows[0].phone, '+94 77');
  assert.equal(rows[1].draft, '');
  assert.equal(rows[1].kind, '');
});

t('a reply counts only from the person, not from the owner or a bounce notice', () => {
  assert.equal(contactReplied(['Me <owner@biz.com>', 'Ann Lee <ANN@x.com>'], 'ann@x.com'), true);
  assert.equal(contactReplied(['Me <owner@biz.com>'], 'ann@x.com'), false);
  assert.equal(contactReplied(['Mailer <mailer-daemon@googlemail.com>'], 'ann@x.com'), false);
  assert.equal(contactReplied([], ''), false);
});

console.log(`\n${n} passed`);
