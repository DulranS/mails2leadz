// lib/journey-branch.js - branch steps for journeys (pass 405). Pure: nothing is read, sent or written here.
//
// A branch step sends nothing. After its wait it asks one question, "replied", and sends the person to one later step
// (yes) or another (no). A target can also be "end", which stops the journey for that person.
//   Written as:  3 | branch | if replied | yes 5 | no 4
// Steps are numbered from 1 in the order they are written. A branch may only go forward, so no loops are possible,
// and it cannot be the first step (it checks replies to the email before it).
//
// "replied" means: a reply in the thread of the most recent journey email (lib/journey-replies.js). It is sticky: once a
// reply is recorded for the person it stays recorded. Only email sends have a thread, so a step sent by hand has none.

export const BRANCH = 'branch';
export const BRANCH_CONDITIONS = ['replied'];
export const BRANCH_LOG_MAX = 20;
const DAY = 86400000;

export const isBranch = (step) => !!step && step.channel === BRANCH;

/**
 * Checks the branches of one journey. Returns { ok: true } or { ok: false, error } with the first problem in plain words.
 * Targets are 1-based step numbers or 'end'.
 */
export function checkBranches(steps = []) {
  const list = Array.isArray(steps) ? steps : [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!isBranch(s)) continue;
    const num = i + 1;
    if (i === 0) return { ok: false, error: 'Step 1 cannot be a branch. A branch checks replies to the email before it.' };
    for (const [label, to] of [['yes', s.yes], ['no', s.no]]) {
      if (to === 'end') continue;
      if (!Number.isInteger(to) || to < 1 || to > list.length) return { ok: false, error: `Step ${num} sends "${label}" to step ${to}, which does not exist.` };
      if (to === num) return { ok: false, error: `Step ${num} cannot point to itself.` };
      if (to < num) return { ok: false, error: `Step ${num} points back to step ${to}. A branch can only go forward, so a loop is not allowed.` };
    }
  }
  return { ok: true };
}

/**
 * Where a person stands now, after any branch whose wait has passed. Pure: the caller decides whether to save the result.
 * Returns { stepIndex, lastStepAt, done, routedTo, endedBy, branchLog (new decisions only), changed }.
 *
 * Reply rule: a reply stops the journey at its next plain step (email, text task or call task). A plain step that a
 * branch sent the person to is the exception: the branch already took the reply into account.
 */
export function resolveEnrolmentPosition(enrolment = {}, journey = {}, now = Date.now()) {
  const steps = Array.isArray(journey?.steps) ? journey.steps : [];
  const nowIso = new Date(now).toISOString();
  const out = {
    stepIndex: Number(enrolment.stepIndex) || 0,
    lastStepAt: enrolment.lastStepAt || enrolment.enrolledAt || null,
    done: enrolment.done === true,
    routedTo: Number.isInteger(enrolment.routedTo) ? enrolment.routedTo : null,
    endedBy: enrolment.endedBy || '',
    branchLog: [],
    changed: false,
  };
  if (out.done) return out;
  while (out.stepIndex < steps.length && isBranch(steps[out.stepIndex])) {
    const s = steps[out.stepIndex];
    const since = Date.parse(out.lastStepAt || '') || now;
    if (now < since + (Number(s.waitDays) || 0) * DAY) return out; // not due yet
    const replied = enrolment.replied === true;
    const to = replied ? s.yes : s.no;
    out.branchLog.push({ step: out.stepIndex + 1, outcome: replied ? 'replied' : 'no_reply', to, at: nowIso });
    out.changed = true;
    out.lastStepAt = nowIso;
    if (to === 'end') { out.done = true; out.endedBy = 'branch'; return out; }
    out.stepIndex = to - 1;
    out.routedTo = to - 1;
  }
  if (out.stepIndex >= steps.length) { out.done = true; out.changed = true; return out; }
  if (enrolment.replied === true && out.routedTo !== out.stepIndex) {
    out.done = true; out.endedBy = 'reply'; out.changed = true;
  }
  return out;
}

/** The branch fields for one saved step, from the parsed words. Returns null when a target is not a step number or 'end'. */
export function branchStep({ waitDays, condition, yes, no }) {
  const cond = String(condition || '').toLowerCase().replace(/^if\s+/, '').trim();
  if (!BRANCH_CONDITIONS.includes(cond)) return null;
  const target = (v) => (v === 'end' ? 'end' : Number.isInteger(Number(v)) && Number(v) >= 1 ? Number(v) : null);
  const y = target(yes), n = target(no);
  if (y === null || n === null) return null;
  return { waitDays, channel: BRANCH, condition: cond, yes: y, no: n, text: '' };
}
