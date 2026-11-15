// lib/journey.js - a visual-style journey: ordered steps with waits, each one listed for you to send and mark done. Pure. Nothing is sent by this module.
export const MAX_STEPS = 8;
export const CHANNELS = ['email', 'sms'];

/** "wait days | channel | message" lines, max eight steps. A "trigger: deal_won" (or invoice_paid, ticket_resolved) line starts the journey for new people automatically. Bad lines are skipped and counted. */
export const JOURNEY_TRIGGERS = ['deal_won', 'invoice_paid', 'ticket_resolved'];
export function parseJourney(text) {
  const steps = []; let skipped = 0; let trigger = '';
  for (const line of String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const tm = /^trigger\s*:\s*([a-z_]+)$/i.exec(line);
    if (tm) { const t = tm[1].toLowerCase(); if (JOURNEY_TRIGGERS.includes(t) && !trigger) trigger = t; else skipped++; continue; }
    const [wait, channel, ...rest] = line.split('|').map((x) => x.trim());
    const days = Number(wait), msg = rest.join('|').slice(0, 1000);
    if (!(days >= 0 && days <= 30) || !CHANNELS.includes(channel) || msg.length < 5) { skipped++; continue; }
    steps.push({ waitDays: days, channel, text: msg });
  }
  return { steps: steps.slice(0, MAX_STEPS), skipped, trigger };
}

/** The step due for an enrolment now, or null. A reply stops the journey for that person. */
export function dueStep(enrolment, journey, now = Date.now()) {
  if (!enrolment || !journey || enrolment.replied || enrolment.done) return null;
  const steps = Array.isArray(journey.steps) ? journey.steps : [];
  const i = Number(enrolment.stepIndex) || 0;
  if (i >= steps.length) return null;
  const since = Date.parse(enrolment.lastStepAt || enrolment.enrolledAt || '') || now;
  const dueAt = since + steps[i].waitDays * 86400000;
  if (now < dueAt) return null;
  return { stepIndex: i, channel: steps[i].channel, text: steps[i].text, total: steps.length };
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
