// lib/broadcast.js - newsletters to the confirmed mailing list: the rules for a broadcast (pure: no database).
//
// Limits (all deliberate): a subject of up to 150 characters and a body of 10 to 5,000; at most 5,000 people in one
// broadcast; at most 500 broadcast emails a day per account (a mailbox that sends in bulk gets flagged, and a complaint
// costs the owner's whole account its reputation); sent in small paced batches, one batch per request.
// Every email carries an unsubscribe link and a line saying why the person is receiving it; a broadcast is refused
// when the public address is not https, because then the unsubscribe link could not work.
export const BROADCAST_LIMITS = Object.freeze({ subjectMax: 150, bodyMin: 10, bodyMax: 5000, recipientsMax: 5000, dailyMax: 500, batchMax: 10, nameMax: 80 });
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** Checks a draft. Keeps line breaks in the body; removes control characters everywhere else. */
export function sanitizeBroadcast(raw = {}) {
  const subject = clean(raw.subject, BROADCAST_LIMITS.subjectMax + 1);
  if (!subject) return { ok: false, error: 'Write a subject line.' };
  if (subject.length > BROADCAST_LIMITS.subjectMax) return { ok: false, error: `The subject is longer than ${BROADCAST_LIMITS.subjectMax} characters.` };
  const body = String(raw.body ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (body.length < BROADCAST_LIMITS.bodyMin) return { ok: false, error: `Write a message of at least ${BROADCAST_LIMITS.bodyMin} characters.` };
  if (body.length > BROADCAST_LIMITS.bodyMax) return { ok: false, error: `The message is longer than ${BROADCAST_LIMITS.bodyMax} characters.` };
  return { ok: true, value: { subject, body } };
}

/** {{name}} becomes the person's first name when we have it, otherwise "there". Nothing else is substituted. */
export function fillBroadcast(text, { name = '' } = {}) {
  const first = clean(name, BROADCAST_LIMITS.nameMax).split(' ')[0] || 'there';
  return String(text ?? '').replace(/\{\{\s*name\s*\}\}/gi, first);
}

/** The line that says why the person is getting the email. Added to every broadcast. */
export function consentLine(businessName = '') {
  return `You are receiving this because you agreed to receive emails from ${clean(businessName, 120) || 'us'}.`;
}

/** The batch to send now: the next ids in the snapshot, capped by the batch size and what is left of today's allowance. */
export function nextBatch({ recipients = [], cursor = 0, sentToday = 0 } = {}) {
  const room = Math.max(0, BROADCAST_LIMITS.dailyMax - (Number(sentToday) || 0));
  const take = Math.min(BROADCAST_LIMITS.batchMax, room, Math.max(0, recipients.length - cursor));
  return { ids: recipients.slice(cursor, cursor + take), nextCursor: cursor + take, dailyRoom: room - take, done: cursor + take >= recipients.length };
}

/** Today's count for the account (a date record that resets at midnight UTC). */
export function todaysSends(record, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return record && record.date === today ? Number(record.count) || 0 : 0;
}

// Scheduled newsletters: a start time at least 5 minutes away and no more than 90 days away.
export const SCHEDULE_LIMITS = Object.freeze({ minAheadMs: 5 * 60000, maxAheadMs: 90 * 86400000 });
// Batches the hourly scheduled run may send, across ALL accounts (10 emails each): about 120 newsletter emails an hour
// platform-wide, so one large list cannot monopolise the job or push the platform into a sending burst.
export const CRON_BATCH_BUDGET = 12;

export function validSchedule(at, now = Date.now()) {
  const t = Date.parse(at || '');
  if (!Number.isFinite(t)) return { ok: false, error: 'Choose a date and time.' };
  if (t < now + SCHEDULE_LIMITS.minAheadMs) return { ok: false, error: 'Choose a time at least 5 minutes from now.' };
  if (t > now + SCHEDULE_LIMITS.maxAheadMs) return { ok: false, error: 'Choose a time within the next 90 days.' };
  return { ok: true, iso: new Date(t).toISOString() };
}

export const isDue = (b, now = Date.now()) => !!b && b.status === 'scheduled' && Date.parse(b.scheduledFor || '') <= now;

/** Takes at most `budget` items, one from each queue in turn, so one account's long newsletter never blocks another's. */
export function roundRobin(queues = [], budget = 0) {
  const out = [];
  const q = queues.map((x) => [...x]);
  while (out.length < budget && q.some((x) => x.length)) {
    for (const x of q) {
      if (out.length >= budget) break;
      if (x.length) out.push(x.shift());
    }
  }
  return out;
}
