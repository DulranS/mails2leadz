// lib/data-requests.js - tracks requests from people to see, correct, or erase their data, against the response deadline.
// Sri Lanka's Personal Data Protection Act No. 9 of 2022, s.17(1) as it stood: 21 working days. The Personal Data Protection
// (Amendment) Act No. 22 of 2025 (certified 30 Oct 2025) changes s.17 to one month from receipt, extendable by two months for
// reasons given. Its commencement is set by Ministerial Order, not confirmed here. Until that is known, the due date is the
// EARLIER of the two, so the app is never late under either rule. Pass 345.
// Working days are counted Monday to Friday only. Public holidays are not excluded, so the due date is never later than the
// legal one (fewer days skipped means an earlier date). The owner decides the outcome; nothing here answers the person.

export const REQUEST_KINDS = ['access', 'correction', 'erasure', 'withdrawal'];
export const REQUEST_KIND_LABELS = {
  access: 'See my data',
  correction: 'Correct my data',
  erasure: 'Erase my data',
  withdrawal: 'Withdraw consent',
};
export const DEADLINE_WORKING_DAYS = 21;
export const DUE_SOON_DAYS = 3;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** The calendar date `n` working days after `iso` (YYYY-MM-DD), skipping Saturdays and Sundays. */
export function addWorkingDays(iso, n) {
  if (!DATE_RE.test(String(iso))) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

/** The date one calendar month after `iso`, clamped to the end of a shorter month. */
export function addOneMonth(iso) {
  if (!DATE_RE.test(String(iso))) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  const day = d.getUTCDate();
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out.toISOString().slice(0, 10);
}

/** The answer-by date for a request received on `iso`: the earlier of 21 working days and one calendar month. */
export function deadlineFor(iso) {
  const byDays = addWorkingDays(iso, DEADLINE_WORKING_DAYS);
  const byMonth = addOneMonth(iso);
  if (!byDays || !byMonth) return null;
  return byDays <= byMonth ? byDays : byMonth;
}

/** One request, checked and cleaned. Returns null when there is no name or no usable received date. */
export function sanitizeRequest(input = {}, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const name = clean(input.name, 120);
  if (!name) return null;
  const receivedOn = DATE_RE.test(String(input.receivedOn || '')) ? String(input.receivedOn) : String(today);
  const dueOn = deadlineFor(receivedOn);
  if (!dueOn) return null;
  const email = clean(input.email, 254).toLowerCase();
  return {
    kind: REQUEST_KINDS.includes(input.kind) ? input.kind : 'access',
    name,
    email: EMAIL_RE.test(email) ? email : '',
    receivedOn,
    dueOn,
    status: 'open',
    doneOn: null,
    notes: clean(input.notes, 1000),
  };
}

/** open, due_soon (within DUE_SOON_DAYS working days of the deadline), overdue, or done. */
export function requestState(req, today = new Date().toISOString().slice(0, 10)) {
  if (!req) return 'open';
  if (req.status === 'done') return 'done';
  if (!DATE_RE.test(String(req.dueOn || ''))) return 'open';
  if (today > req.dueOn) return 'overdue';
  const soon = addWorkingDays(today, DUE_SOON_DAYS);
  return soon && req.dueOn <= soon ? 'due_soon' : 'open';
}

export const REQUEST_STATE_LABELS = { open: 'Open', due_soon: 'Due soon', overdue: 'Overdue', done: 'Done' };

/** Requests that need attention: overdue first, then due soon, earliest deadline first. */
export function requestsNeedingAttention(list = [], today = new Date().toISOString().slice(0, 10)) {
  const rank = { overdue: 0, due_soon: 1, open: 2, done: 3 };
  return (Array.isArray(list) ? list : [])
    .map((r) => ({ ...r, state: requestState(r, today) }))
    .sort((a, b) => rank[a.state] - rank[b.state] || String(a.dueOn).localeCompare(String(b.dueOn)));
}
