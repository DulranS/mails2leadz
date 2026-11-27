// lib/journey-tasks.js - a text or call step becomes a task for the owner (pass 405). Pure: what the task says and whether it may be made.
// Nothing is dialled or texted. A text task holds the draft to send from the owner's own phone. A call task holds a suggested note.
import { dayKey } from './task-rules.js';

const clip = (v, n) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export const TASK_DRAFT_MAX = 1000;

/** The task for one due text or call step. Fields the Tasks page already reads (title, dueDate, assignedTo, done) plus the journey detail. */
export function journeyTask({ channel, email, phone = '', text = '', journeyName = '', stepNumber = 0, total = 0, dueDate = '', journeyId = '', enrolmentId = '' } = {}) {
  const kind = channel === 'sms' ? 'sms' : 'call';
  const contact = clip(email, 200);
  const where = `${clip(journeyName, 60) || 'Journey'}, step ${stepNumber} of ${total}`;
  return {
    title: clip(`${kind === 'call' ? 'Call' : 'Text'} ${contact} (${where})`, 160),
    dueDate: clip(dueDate, 10),
    assignedTo: '',
    done: false,
    kind,
    contact,
    phone: clip(phone, 40),
    note: kind === 'call' ? clip(text, TASK_DRAFT_MAX) : '',
    draft: kind === 'sms' ? clip(text, TASK_DRAFT_MAX) : '',
    journeyId: clip(journeyId, 128),
    enrolmentId: clip(enrolmentId, 128),
    stepNumber: Number(stepNumber) || 0,
  };
}

/**
 * What to do with one due text or call step: make the task, hold it, or drop the journey for this person.
 * Same consent rule as automatic email: no task until agreement is recorded. A do-not-contact person gets no task.
 * @returns {{action: 'task'|'hold'|'do_not_contact', why: string, task?: object}}
 */
export function planJourneyTask({ enrolment = {}, due = {}, phone = '', blocked = false, now = Date.now(), offsetMin = 0 } = {}) {
  if (due.channel !== 'sms' && due.channel !== 'call') return { action: 'hold', why: 'not_a_task_step' };
  if (blocked) return { action: 'do_not_contact', why: 'do_not_contact' };
  if (!enrolment.consentConfirmedAt) return { action: 'hold', why: 'no_agreement_recorded' };
  const task = journeyTask({
    channel: due.channel, email: due.email || enrolment.email, phone, text: due.text,
    journeyName: due.journey, stepNumber: (Number(due.stepIndex) || 0) + 1, total: due.total,
    dueDate: dayKey(now, offsetMin), journeyId: enrolment.journeyId, enrolmentId: due.enrolmentId || enrolment.id,
  });
  return { action: 'task', why: 'ok', task };
}
