// lib/deal-extras.js - small pieces of per-deal data that live on the deal document itself.
// Pure functions, no imports (deal-utils.js uses the sanitizers, so this file must not import it).
//
//  * qualification: four yes / no / unknown answers (budget, decision maker, need, timeline)
//  * onboardingDone: [{ id, at }] checklist steps ticked for a customer (an array, so un-ticking really removes it)
//  * issues: [{ id, text, openedAt, resolvedAt }] support issues raised by a customer

const DAY = 86400000;
const toMs = (v) => {
  if (!v) return null;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};
const clipText = (v, max) =>
  String(v ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

// ---------------- qualification ----------------
export const QUAL_FIELDS = [
  { id: 'budget', label: 'Has budget', hint: 'Can they pay for this?' },
  { id: 'authority', label: 'Decision maker', hint: 'Are you talking to the person who decides?' },
  { id: 'need', label: 'Real need', hint: 'Do they have the problem you solve?' },
  { id: 'timeline', label: 'Has a timeline', hint: 'Do they want to act in the next few months?' },
];
export const QUAL_ANSWERS = ['yes', 'no', 'unknown'];

export function sanitizeQualification(q) {
  const out = {};
  for (const f of QUAL_FIELDS) out[f.id] = QUAL_ANSWERS.includes(q?.[f.id]) ? q[f.id] : 'unknown';
  return out;
}

/** Plain-language read of the four answers. A "no" on budget or need is a real warning; everything else is a judgement call. */
export function qualificationSummary(q) {
  const s = sanitizeQualification(q);
  const vals = QUAL_FIELDS.map((f) => s[f.id]);
  const yes = vals.filter((v) => v === 'yes').length;
  const no = vals.filter((v) => v === 'no').length;
  const answered = yes + no;
  let label = 'Not assessed';
  if (answered > 0) {
    if (s.budget === 'no' || s.need === 'no') label = 'Weak';
    else if (yes >= 3 && no === 0) label = 'Strong';
    else label = 'Mixed';
  }
  return { yes, no, answered, complete: answered === QUAL_FIELDS.length, label, answers: s };
}

// ---------------- onboarding checklist ----------------
export const ONBOARDING_STEPS = [
  { id: 'welcome', label: 'Welcome message sent' },
  { id: 'kickoff', label: 'Kickoff call or meeting held' },
  { id: 'info', label: 'Collected what you need from them' },
  { id: 'first_value', label: 'First result delivered (activated)' },
  { id: 'invoice', label: 'First invoice sent' },
  { id: 'checkin', label: 'First check-in done' },
];
export const ACTIVATION_STEP = 'first_value';

export function sanitizeOnboardingDone(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const id = x?.id;
    if (!ONBOARDING_STEPS.some((s) => s.id === id) || seen.has(id)) continue;
    const at = toMs(x.at);
    seen.add(id);
    out.push({ id, at: at ? new Date(at).toISOString() : new Date().toISOString() });
  }
  return out;
}

/** The new `onboardingDone` array after ticking or un-ticking one step. */
export function setOnboardingStep(current, stepId, done, now = new Date()) {
  const base = sanitizeOnboardingDone(current).filter((x) => x.id !== stepId);
  if (!ONBOARDING_STEPS.some((s) => s.id === stepId)) return sanitizeOnboardingDone(current);
  return done ? [...base, { id: stepId, at: now.toISOString() }] : base;
}

export function onboardingProgress(deal, now = Date.now()) {
  const done = sanitizeOnboardingDone(deal?.onboardingDone);
  const ids = new Set(done.map((x) => x.id));
  const wonAt = toMs(deal?.closedAt) || toMs(deal?.createdAt);
  const act = done.find((x) => x.id === ACTIVATION_STEP);
  const activatedAt = act ? toMs(act.at) : null;
  return {
    done: ids.size,
    total: ONBOARDING_STEPS.length,
    pct: ids.size / ONBOARDING_STEPS.length,
    ids,
    activated: !!act,
    activatedAt,
    daysToActivate: act && wonAt && activatedAt >= wonAt ? Math.round((activatedAt - wonAt) / DAY) : null,
    daysSinceWon: wonAt ? Math.max(0, Math.floor((now - wonAt) / DAY)) : null,
    lastStepAt: done.reduce((m, x) => Math.max(m, toMs(x.at) || 0), 0) || null,
  };
}

// ---------------- support issues ----------------
export const MAX_ISSUES = 50;

export function sanitizeIssues(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const x of list.slice(-MAX_ISSUES)) {
    const text = clipText(x?.text, 600);
    const id = clipText(x?.id, 40);
    const openedAt = toMs(x?.openedAt);
    if (!text || !id || !openedAt) continue;
    const resolved = toMs(x?.resolvedAt);
    out.push({ id, text, openedAt: new Date(openedAt).toISOString(), resolvedAt: resolved ? new Date(resolved).toISOString() : null });
  }
  return out;
}

export function addIssue(current, text, now = new Date()) {
  const t = clipText(text, 600);
  if (!t) return sanitizeIssues(current);
  const issue = { id: `i${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text: t, openedAt: now.toISOString(), resolvedAt: null };
  return sanitizeIssues([...sanitizeIssues(current), issue]);
}

export function setIssueResolved(current, id, resolved, now = new Date()) {
  return sanitizeIssues(sanitizeIssues(current).map((i) => (i.id === id ? { ...i, resolvedAt: resolved ? now.toISOString() : null } : i)));
}

export const openIssues = (deal) => sanitizeIssues(deal?.issues).filter((i) => !i.resolvedAt);
