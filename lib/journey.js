// lib/journey.js - a visual-style journey: ordered steps with waits, each one listed for you to send and mark done. Pure. Nothing is sent by this module.
// Channels: email (sent by the app when switched on, otherwise listed for you), sms (creates a text task for you, with the draft on it) and
// call (creates a call task for you; nothing is dialled). Branch steps (lib/journey-branch.js) send nothing.
import { isBranch, branchStep, checkBranches, resolveEnrolmentPosition } from './journey-branch.js';

export const MAX_STEPS = 8;
export const CHANNELS = ['email', 'sms', 'call'];
const DAY = 86400000;
const BRANCH_WORD = 'branch';

/** "wait days | channel | message" lines, max eight steps. A "trigger: deal_won" (or invoice_paid, ticket_resolved) line starts the journey for new people automatically. Bad lines are skipped and counted.
 *  A branch line reads "wait days | branch | if replied | yes N | no M" (N and M are step numbers, or "end"). */
export const JOURNEY_TRIGGERS = ['deal_won', 'invoice_paid', 'ticket_resolved'];
export function parseJourney(text) {
  const steps = []; let skipped = 0; let trigger = ''; let brokenBranches = 0;
  for (const line of String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const tm = /^trigger\s*:\s*([a-z_]+)$/i.exec(line);
    if (tm) { const t = tm[1].toLowerCase(); if (JOURNEY_TRIGGERS.includes(t) && !trigger) trigger = t; else skipped++; continue; }
    const parts = line.split('|').map((x) => x.trim());
    const [wait, channel, ...rest] = parts;
    const days = Number(wait);
    if (channel === BRANCH_WORD) {
      const yes = /^yes\s+(\d+|end)$/i.exec(rest[1] || ''), no = /^no\s+(\d+|end)$/i.exec(rest[2] || '');
      const b = rest.length === 3 && yes && no && days >= 0 && days <= 30 && branchStep({ waitDays: days, condition: rest[0], yes: yes[1].toLowerCase(), no: no[1].toLowerCase() });
      if (!b) { skipped++; brokenBranches++; continue; }
      steps.push(b);
      continue;
    }
    const msg = rest.join('|').slice(0, 1000);
    if (!(days >= 0 && days <= 30) || !CHANNELS.includes(channel) || msg.length < 5) { skipped++; continue; }
    steps.push({ waitDays: days, channel, text: msg });
  }
  const branches = steps.filter(isBranch).length; // counted before the eight-step cut, so a branch past it is not lost
  return { steps: steps.slice(0, MAX_STEPS), skipped, trigger, total: steps.length, branches, brokenBranches };
}
/** A journey with branches is saved only when every line reads and every branch points at a real, later step. Plain journeys pass as before. */
export function checkJourney(parsed = {}) {
  const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
  if (parsed.brokenBranches) return { ok: false, error: 'A branch line could not be read. Write it as "wait days | branch | if replied | yes N | no M".' };
  if (!parsed.branches) return { ok: true };
  if (parsed.skipped) return { ok: false, error: 'A line could not be read. Fix it, so the step numbers in each branch point at the right steps.' };
  if ((parsed.total || 0) > MAX_STEPS) return { ok: false, error: `A journey with branches can have up to ${MAX_STEPS} steps.` };
  return checkBranches(steps);
}

/** The step due for an enrolment now, or null. A reply stops a plain step (see lib/journey-branch.js). Branch steps are never returned: they send nothing. */
export function dueStep(enrolment, journey, now = Date.now()) {
  if (!enrolment || !journey) return null;
  const steps = Array.isArray(journey.steps) ? journey.steps : [];
  const pos = resolveEnrolmentPosition(enrolment, journey, now);
  if (pos.done || pos.stepIndex >= steps.length) return null;
  const s = steps[pos.stepIndex];
  if (isBranch(s)) return null;
  const since = Date.parse(pos.lastStepAt || '') || now;
  if (now < since + (Number(s.waitDays) || 0) * DAY) return null;
  return { stepIndex: pos.stepIndex, channel: s.channel, text: s.text, total: steps.length };
}

/** Everything due across the enrolments, for the owner's action list. */
export function journeyActions(enrolments = [], journeys = [], now = Date.now()) {
  const byId = new Map((Array.isArray(journeys) ? journeys : []).map((j) => [j.id, j]));
  const out = [];
  for (const e of Array.isArray(enrolments) ? enrolments : []) {
    const j = byId.get(e.journeyId);
    const d = dueStep(e, j, now);
    if (d) out.push({ enrolmentId: e.id, email: e.email, journey: j.name, ...d });
  }
  return out;
}
