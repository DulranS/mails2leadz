// lib/media-plan.js (v401): media plan. The owner plans how much to spend on each channel in each month. This compares the plan with the spend
// already entered (lib/marketing.js), channel by channel and month by month. Pure: nothing is guessed.
// A spend within 5% of the plan counts as on plan. The 5% is a choice made here, not a standard.
import { MARKETING_CHANNELS } from './marketing.js';

const CHANNEL_IDS = MARKETING_CHANNELS.map((c) => c.id);
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const TOLERANCE_PCT = 5;
export const PLAN_LIMITS = { lines: 300, note: 120 };
const r1 = (n) => Math.round(n * 10) / 10;
const money = (n) => Math.round(n * 100) / 100;

/** @returns {{ entry: object } | { error: string }} */
export function sanitizePlanLine(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'Nothing to save.' };
  const channel = String(raw.channel || '');
  if (!CHANNEL_IDS.includes(channel)) return { error: 'Pick a channel.' };
  const month = String(raw.month || '');
  if (!YM.test(month)) return { error: 'Pick the month.' };
  if (raw.planned === '' || raw.planned === null || raw.planned === undefined) return { error: 'Enter the planned spend (0 or more).' };
  const planned = Number(raw.planned);
  if (!Number.isFinite(planned) || planned < 0) return { error: 'Enter the planned spend (0 or more).' };
  const note = String(raw.note || '').replace(/\s+/g, ' ').trim().slice(0, PLAN_LIMITS.note);
  return { entry: { channel, month, planned: money(planned), note } };
}

/**
 * Plan against actual, for each channel and month that has a plan or spend. Newest month first, then channel order.
 * @param {{ plan?: {channel:string, month:string, planned:number}[], spend?: {channel:string, month:string, amount:number}[] }} args
 */
export function mediaPlanVariance({ plan = [], spend = [] } = {}) {
  const keyOf = (channel, month) => `${month}|${channel}`;
  const planned = new Map();
  const actual = new Map();
  for (const p of plan) {
    if (!Number.isFinite(p.planned) || p.planned < 0) continue;
    planned.set(keyOf(p.channel, p.month), (planned.get(keyOf(p.channel, p.month)) ?? 0) + p.planned);
  }
  for (const s of spend) {
    if (!Number.isFinite(s.amount) || s.amount < 0) continue;
    actual.set(keyOf(s.channel, s.month), (actual.get(keyOf(s.channel, s.month)) ?? 0) + s.amount);
  }
  const keys = new Set([...planned.keys(), ...actual.keys()]);
  const order = (k) => CHANNEL_IDS.indexOf(k.split('|')[1]);
  const rows = [...keys]
    .map((k) => {
      const [month, channel] = k.split('|');
      const plannedAmt = money(planned.get(k) ?? 0);
      const actualAmt = money(actual.get(k) ?? 0);
      const variance = money(actualAmt - plannedAmt);
      let status;
      if (plannedAmt === 0) status = 'unplanned';
      else if (actualAmt === 0) status = 'not_spent';
      else if (actualAmt > plannedAmt * (1 + TOLERANCE_PCT / 100)) status = 'over';
      else if (actualAmt < plannedAmt * (1 - TOLERANCE_PCT / 100)) status = 'under';
      else status = 'on_plan';
      return {
        month,
        channel,
        planned: plannedAmt,
        actual: actualAmt,
        variance,
        variancePct: plannedAmt > 0 ? r1((variance / plannedAmt) * 100) : null,
        status,
      };
    })
    .sort((a, b) => (a.month !== b.month ? (a.month < b.month ? 1 : -1) : order(`x|${a.channel}`) - order(`x|${b.channel}`)));
  const plannedTotal = money(rows.reduce((t, r) => t + r.planned, 0));
  const actualTotal = money(rows.reduce((t, r) => t + r.actual, 0));
  return {
    rows,
    plannedTotal,
    actualTotal,
    overallVariancePct: plannedTotal > 0 ? r1(((actualTotal - plannedTotal) / plannedTotal) * 100) : null,
    overTolerance: TOLERANCE_PCT,
  };
}
