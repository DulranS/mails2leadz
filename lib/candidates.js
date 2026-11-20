// lib/candidates.js - candidate profiles for recruitment mode (pass 339; CVs added in pass 344). Pure rules, safe in the browser and on the server.
// A profile holds what the owner needs to run the search: name, a way to contact, role, stage, notes, whether the candidate agreed
// to be approached, and optionally the CV as pasted text (pass 344). Fee terms are not held: the placement fee is the deal value (pass 331).
// Every profile gets a retention date; past it, the profile (and its CV) is listed as due and the owner decides. Nothing is deleted
// automatically. A profile that holds an email is found by the erase and export tools, so its CV goes with it.

export const CANDIDATE_STAGES = ['new', 'shortlisted', 'interviewing', 'offered', 'placed', 'rejected', 'withdrawn'];
export const CANDIDATE_STAGE_LABELS = { new: 'New', shortlisted: 'Shortlisted', interviewing: 'Interviewing', offered: 'Offered', placed: 'Placed', rejected: 'Rejected', withdrawn: 'Withdrawn' };
export const RETENTION_MONTHS = 12;
export const CV_MAX = 20000;

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** The ISO date `months` after `iso` (the same day of the month, clamped to the end of a shorter month). */
export function addMonthsIso(iso, months) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const day = d.getUTCDate();
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out.toISOString();
}

/** CV text as pasted: line breaks kept, other control characters removed, runs of spaces collapsed, capped at CV_MAX. */
export function sanitizeCv(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, CV_MAX);
}

/** A profile's email, cleaned, or '' when it has none that is valid. */
export function validEmail(email) {
  const e = clean(email, 254).toLowerCase();
  return EMAIL_RE.test(e) ? e : '';
}

/**
 * The two fields to save when the owner changes a CV. An empty text removes the CV. A CV can only be held on a profile with a valid
 * email, so an erasure or access request (which find people by email) always reaches it. Pass 345.
 */
export function cvPatch(text, now = new Date(), email = '') {
  const cv = sanitizeCv(text);
  if (!cv) return { cv: '', cvAddedAt: null };
  if (!validEmail(email)) return { error: 'Add the candidate\'s email first. A CV can only be kept on a profile with an email, so an erasure request can find it.' };
  return { cv, cvAddedAt: now.toISOString() };
}

/**
 * One profile, checked and cleaned. Returns null when there is no name. A profile is marked as agreed to be approached only
 * when the owner says so, and the time of that answer is kept with it.
 */
export function sanitizeCandidate(input = {}, { now = new Date() } = {}) {
  const name = clean(input.name, 120);
  if (!name) return null;
  const email = clean(input.email, 254).toLowerCase();
  const stage = CANDIDATE_STAGES.includes(input.stage) ? input.stage : 'new';
  const consentToContact = input.consentToContact === true;
  const nowIso = now.toISOString();
  return {
    name,
    email: EMAIL_RE.test(email) ? email : '',
    phone: clean(input.phone, 40).replace(/[^0-9+ ()-]/g, ''),
    role: clean(input.role, 120),
    stage,
    notes: clean(input.notes, 1000),
    source: clean(input.source, 80),
    consentToContact,
    consentAt: consentToContact ? nowIso : null,
    cv: '',
    cvAddedAt: null,
    createdAt: nowIso,
    retainUntil: addMonthsIso(nowIso, RETENTION_MONTHS),
  };
}

/** True only when the owner recorded that the candidate agreed to be approached, and when. Anything else is not approached. */
export function canApproach(profile) {
  return profile?.consentToContact === true && Boolean(profile.consentAt);
}

/** True when the profile is past its retention date and still holds a CV. The owner removes it or deletes the profile. */
export function cvPastRetention(profile, now = new Date()) {
  return Boolean(profile?.cv) && Boolean(profile.retainUntil) && Date.parse(profile.retainUntil) < now.getTime();
}

/** The profiles past their retention date, oldest first. The owner decides what to delete; nothing is deleted automatically. */
export function retentionDue(records = [], now = new Date()) {
  const t = now.getTime();
  return (Array.isArray(records) ? records : [])
    .filter((r) => r && r.retainUntil && Date.parse(r.retainUntil) < t)
    .sort((a, b) => String(a.retainUntil).localeCompare(String(b.retainUntil)));
}

export function candidateStageLabel(stage) {
  return CANDIDATE_STAGE_LABELS[stage] || CANDIDATE_STAGE_LABELS.new;
}
