// lib/breach-register.js - the owner's log of personal data breaches (pass 343; deadlines and people-notice added in pass 345).
// Pure: no I/O.
//
// Sources, and how far to trust them:
//  - Sri Lanka PDPA No. 9 of 2022, s.23(1): the controller must notify the Authority of a personal data breach "within such period
//    of time as may be determined by rules". The Act itself sets no period.
//  - The Data Protection Authority's DRAFT "Data Breach Notification Rules" (v1.0), which set the period:
//      rule 5(1): notify the Authority within 72 hours after the controller (or its processor) becomes aware, "to the extent feasible".
//      rule 9:    notify affected people at the same time as the Authority.
//    These are a draft. Confirm the final text before relying on them. The app uses 72 hours as a deadline to act on, not as legal advice.
//  - The Authority's rules are expected to apply from 1 Jan 2027 (the FT, Gazette 2498/16). Until then the register is a record.
// The app flags what needs a decision and when. The owner, or their adviser, decides and sends the notices.

export const BREACH_STATUS = ['open', 'contained', 'closed'];
export const BREACH_STATUS_LABELS = { open: 'Open', contained: 'Contained', closed: 'Closed' };
export const DATA_AFFECTED = ['yes', 'no', 'unknown'];
export const DATA_AFFECTED_LABELS = { yes: 'Yes, personal data', no: 'No personal data', unknown: 'Not known yet' };
export const AUTHORITY_HOURS = 72; // DPA draft rules, rule 5(1)
export const REVIEW_PROMPT_HOURS = 72; // a prompt to look again, not a legal rule
// The business is in Sri Lanka (UTC+05:30). A time typed without an offset is read as Sri Lanka time.
const SL_OFFSET = '+05:30';

const HOUR = 3600000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const dateOrNull = (s) => (DATE_RE.test(String(s || '')) && Number.isFinite(new Date(`${s}T00:00:00Z`).getTime()) ? String(s) : null);

/** A time as an ISO string. A date-time without an offset is read as Sri Lanka time. Null when it is not a usable time. */
export function dateTimeOrNull(s) {
  const v = String(s || '').trim();
  if (!v) return null;
  const iso = DATETIME_RE.test(v) ? `${v.length === 16 ? `${v}:00` : v}${SL_OFFSET}` : v;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Milliseconds for a date (YYYY-MM-DD, taken as the start of that day UTC) or an ISO time. Null if neither. */
function msOf(v) {
  if (v == null || v === '') return null;
  const s = String(v);
  const ms = DATE_RE.test(s) ? Date.parse(`${s}T00:00:00Z`) : Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

/** Whole days from one date to another (to minus from). Null when either is not a date. */
export function daysBetween(from, to) {
  const a = dateOrNull(from);
  const b = dateOrNull(to);
  if (!a || !b) return null;
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

/** One breach, checked and cleaned. Returns null when there is no description or no usable discovery time. */
/** The Sri Lanka calendar date (YYYY-MM-DD) of an ISO time. */
function slDate(iso) {
  return new Date(Date.parse(iso) + 5.5 * HOUR).toISOString().slice(0, 10);
}

export function sanitizeBreach(input = {}, { now = new Date(), today = null } = {}) {
  const description = clean(input.description, 2000);
  if (!description) return null;
  const discoveredAt = dateTimeOrNull(input.discoveredAt)
    || (dateOrNull(input.discoveredOn) ? dateTimeOrNull(`${input.discoveredOn}T00:00`) : null)
    || (dateOrNull(today) ? dateTimeOrNull(`${today}T00:00`) : null)
    || now.toISOString();
  const people = Number(input.peopleAffected);
  return {
    title: clean(input.title, 120) || 'Untitled breach',
    description,
    discoveredAt,
    discoveredOn: slDate(discoveredAt),
    dataAffected: DATA_AFFECTED.includes(input.dataAffected) ? input.dataAffected : 'unknown',
    peopleAffected: input.peopleAffected === '' || input.peopleAffected == null || !Number.isInteger(people) || people < 0 ? null : people,
    containment: clean(input.containment, 1000),
    authorityNotifiedOn: dateOrNull(input.authorityNotifiedOn),
    peopleNotifiedOn: dateOrNull(input.peopleNotifiedOn),
    status: 'open',
    closedOn: null,
    notes: clean(input.notes, 1000),
  };
}

/** The moment the Authority notice is due (72 hours after discovery), as ISO, or null when there is no discovery time. */
export function authorityDueAt(b) {
  const ms = msOf(b?.discoveredAt);
  return ms == null ? null : new Date(ms + AUTHORITY_HOURS * HOUR).toISOString();
}

/** Days since discovery, or null. */
export function breachAgeDays(b, today = new Date().toISOString().slice(0, 10)) {
  const start = msOf(b?.discoveredAt) ?? msOf(b?.discoveredOn);
  const end = msOf(today);
  if (start == null || end == null) return null;
  return Math.floor((end - start) / (24 * HOUR));
}

/** True when the people must be told: personal data is affected, the Authority is told or being told, and the people are not yet told. */
export function peopleNoticePending(b) {
  return Boolean(b) && b.status !== 'closed' && b.dataAffected !== 'no' && !b.peopleNotifiedOn;
}

/**
 * What the owner should look at, in order:
 *  - 'closed': nothing to do.
 *  - 'authority_overdue': personal data may be affected, the Authority has no notice date, and 72 hours have passed.
 *  - 'authority_decision': personal data may be affected and the Authority has no notice date yet; due at authorityDueAt.
 *  - 'review': still open after 72 hours. A prompt to check whether it is contained or closed.
 *  - 'open': logged and being handled.
 * `now` is an ISO time, or a date (taken as the start of that day).
 */
export function breachState(b, now = new Date().toISOString()) {
  if (!b) return 'open';
  if (b.status === 'closed') return 'closed';
  const nowMs = msOf(now);
  const due = msOf(authorityDueAt(b));
  if (b.dataAffected !== 'no' && !b.authorityNotifiedOn) {
    if (due != null && nowMs != null && nowMs >= due) return 'authority_overdue';
    return 'authority_decision';
  }
  const discovered = msOf(b.discoveredAt) ?? msOf(b.discoveredOn);
  if (b.status === 'open' && discovered != null && nowMs != null && nowMs - discovered >= REVIEW_PROMPT_HOURS * HOUR) return 'review';
  return 'open';
}

export const BREACH_STATE_LABELS = {
  open: 'Open',
  authority_decision: 'Authority notice due',
  authority_overdue: 'Authority notice overdue',
  review: 'Review: open 72+ hours',
  closed: 'Closed',
};

/** Breaches that need attention first: overdue notices, then notices due, then reviews, then the rest, oldest first within each group. */
export function breachesNeedingAttention(list = [], now = new Date().toISOString()) {
  const rank = { authority_overdue: 0, authority_decision: 1, review: 2, open: 3, closed: 4 };
  return (Array.isArray(list) ? list : [])
    .map((b) => ({ ...b, state: breachState(b, now) }))
    .sort((a, b) => rank[a.state] - rank[b.state] || String(a.discoveredAt || a.discoveredOn).localeCompare(String(b.discoveredAt || b.discoveredOn)));
}
