// lib/marketing.js - what marketing cost, and what it brought back, by channel. Pure: nothing is guessed.
// The owner enters spend per month and per channel. Wins are closed-won deals in the same months, read from each deal's source.
// Referral rewards and partner commission are NOT entered here: Profit already counts them as costs, so counting them twice would
// understate the return on marketing.
export const MARKETING_CHANNELS = [
  { id: 'paid_ads', label: 'Paid ads (Meta, Google, TikTok)', source: 'inbound' },
  { id: 'content', label: 'Content and social (design, posting tools)', source: 'inbound' },
  { id: 'outreach_tools', label: 'Outreach tools (email, enrichment, WhatsApp and SMS credits)', source: 'email' },
  { id: 'events', label: 'Events, print and sponsorships', source: 'other' },
  { id: 'other', label: 'Other marketing', source: 'other' },
];
export const MARKETING_LIMITS = { entries: 300, months: 3 };
const CHANNEL_IDS = MARKETING_CHANNELS.map((c) => c.id);
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

/** @returns {{ entry: object } | { error: string }} */
export function sanitizeSpend(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'Nothing to save.' };
  const channel = String(raw.channel || '');
  if (!CHANNEL_IDS.includes(channel)) return { error: 'Pick a channel.' };
  if (raw.amount === '' || raw.amount === null || raw.amount === undefined) return { error: 'Enter what you spent (0 or more).' };
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount < 0) return { error: 'Enter what you spent (0 or more).' };
  const month = String(raw.month || '');
  if (!YM.test(month)) return { error: 'Pick the month it was spent in.' };
  const note = String(raw.note || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return { entry: { channel, amount: Math.round(amount * 100) / 100, month, note, recurring: raw.recurring === true } };
}

/** The last `months` calendar months (YYYY-MM), newest first, ending with the current month. */
export function recentMonths(now = Date.now(), months = MARKETING_LIMITS.months) {
  const d = new Date(now);
  const out = [];
  for (let i = 0; i < months; i++) out.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  return out;
}

/**
 * @param {{ spend?: object[], deals?: object[], now?: number, months?: number }} args
 * @returns {{ ready: boolean, months: string[], monthsEntered: number, partial: boolean, spend90: number,
 *   wins90: number, blendedCostPerWin: number|null, inboundWins90: number, inboundSpend90: number,
 *   costPerInboundWin: number|null, byChannel: object[] }}
 */
export function computeMarketing({ spend = [], deals = [], now = Date.now(), months = MARKETING_LIMITS.months } = {}) {
  const ms = recentMonths(now, months);
  const windowStart = Date.parse(`${ms[ms.length - 1]}-01T00:00:00Z`);
  const valid = (spend || []).filter((e) => e && CHANNEL_IDS.includes(e.channel) && Number.isFinite(Number(e.amount)) && YM.test(String(e.month || '')));
  // A "same every month" entry counts in each window month from the month it starts, until it is removed.
  const rows = valid.flatMap((e) => {
    if (e.recurring === true) return ms.filter((m) => m >= e.month).map((m) => ({ ...e, month: m }));
    return ms.includes(e.month) ? [e] : [];
  });
  const total = rows.reduce((a, e) => a + Number(e.amount), 0);
  const byChannel = MARKETING_CHANNELS.map((c) => {
    const amount = rows.filter((e) => e.channel === c.id).reduce((a, e) => a + Number(e.amount), 0);
    return { id: c.id, label: c.label, source: c.source, amount: Math.round(amount), share: total > 0 ? Math.round((amount / total) * 100) : null };
  });
  const monthsEntered = ms.filter((m) => rows.some((e) => e.month === m)).length;

  const wins = (deals || []).filter((d) => {
    if (!d || d.stage !== 'closed_won') return false;
    const at = Date.parse(d.closedAt || '');
    return Number.isFinite(at) && at >= windowStart && at <= now;
  });
  const inboundWins = wins.filter((d) => d.source === 'inbound').length;
  const inboundSpend = byChannel.filter((c) => c.source === 'inbound').reduce((a, c) => a + c.amount, 0);

  return {
    ready: total > 0 && wins.length > 0,
    months: ms,
    monthsEntered,
    partial: monthsEntered < ms.length, // a month left empty means the cost per win is overstated: say so
    spend90: Math.round(total),
    wins90: wins.length,
    blendedCostPerWin: total > 0 && wins.length > 0 ? Math.round(total / wins.length) : null,
    inboundWins90: inboundWins,
    inboundSpend90: inboundSpend,
    costPerInboundWin: inboundSpend > 0 && inboundWins > 0 ? Math.round(inboundSpend / inboundWins) : null,
    byChannel,
  };
}
