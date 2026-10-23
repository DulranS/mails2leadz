// lib/experiments.js - the discipline for a founder who is still finding what works: every idea is a small, time-boxed test with a
// number to hit, a date to judge it, and an actual decision at the end (double down, change one thing, or stop). No more than three
// run at once, because ten half-finished tests teach nothing. The app only reminds and records; the decision is always yours.
export const MAX_RUNNING = 3;
export const MAX_ITEMS = 60;
export const DECISIONS = [
  { id: 'double_down', label: 'Double down' },
  { id: 'iterate', label: 'Change one thing and test again' },
  { id: 'stop', label: 'Stop' },
];
const DAY = 86400000;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const day = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };
const num = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };

export function sanitizeExperiment(raw, { now = Date.now(), id = '' } = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'Nothing to save.' };
  const title = clean(raw.title, 140);
  if (title.length < 8) return { error: 'Write the idea you are testing in a sentence, for example "Plumbers in Colombo will pay for a monthly maintenance plan".' };
  const metric = clean(raw.metric, 80);
  if (!metric) return { error: 'Say what you will count, for example "qualified conversations".' };
  const target = num(raw.target);
  if (target === null || target <= 0) return { error: 'Set a number you must reach to call it a success.' };
  const startAt = day(raw.startAt) || new Date(now).toISOString().slice(0, 10);
  const reviewAt = day(raw.reviewAt);
  if (!reviewAt) return { error: 'Pick the date you will judge it.' };
  if (Date.parse(reviewAt) < Date.parse(startAt)) return { error: 'The judging date cannot be before the start.' };
  const out = { id: clean(raw.id || id, 60), title, metric, target, startAt, reviewAt, line: clean(raw.line, 40), notes: clean(raw.notes, 300), status: raw.status === 'decided' ? 'decided' : 'running', actual: num(raw.actual), decision: null, decidedAt: null };
  if (out.status === 'decided') {
    if (!DECISIONS.some((d) => d.id === raw.decision)) return { error: 'Choose what you decided.' };
    if (out.actual === null) return { error: 'Enter the number you actually got.' };
    out.decision = raw.decision;
    out.decidedAt = day(raw.decidedAt) || new Date(now).toISOString().slice(0, 10);
  }
  return { experiment: out };
}

/** What the number says, as a suggestion. The owner decides. */
export function suggest(actual, target) {
  const a = Number(actual), t = Number(target);
  if (!Number.isFinite(a) || !(t > 0)) return null;
  const r = a / t;
  if (r >= 1) return { id: 'double_down', text: 'You hit the target. Double down, or raise the bar and test again.' };
  if (r >= 0.5) return { id: 'iterate', text: 'Partly there. Change one thing (the audience, the message or the price), then test once more.' };
  return { id: 'stop', text: 'Clearly short of the target. Stop, or change something big. Do not keep going just because time was spent.' };
}

export function computeExperiments({ items = [], now = Date.now() } = {}) {
  const list = items.filter((i) => i && typeof i.title === 'string');
  const today = new Date(now).toISOString().slice(0, 10);
  const running = list.filter((i) => i.status !== 'decided').map((i) => {
    const daysLeft = Math.round((Date.parse(i.reviewAt) - Date.parse(today)) / DAY);
    return { ...i, daysLeft, overdue: daysLeft < 0, due: daysLeft <= 0, totalDays: Math.max(1, Math.round((Date.parse(i.reviewAt) - Date.parse(i.startAt)) / DAY)) };
  }).sort((a, b) => a.daysLeft - b.daysLeft);
  const decided = list.filter((i) => i.status === 'decided').sort((a, b) => String(b.decidedAt).localeCompare(String(a.decidedAt)));
  const hit = decided.filter((i) => Number(i.actual) >= Number(i.target)).length;
  return {
    running, decided,
    due: running.filter((i) => i.due),
    canStartMore: running.length < MAX_RUNNING,
    hitRatePct: decided.length >= 3 ? Math.round((hit / decided.length) * 100) : null,
    decidedCount: decided.length,
  };
}
