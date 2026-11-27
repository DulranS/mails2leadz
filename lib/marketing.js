// lib/marketing.js - what marketing cost, and what it brought back, by channel. Pure: nothing is guessed.
// The owner enters spend per month and per channel. Wins are closed-won deals in the same months, read from each deal's source.
// Referral rewards and partner commission are NOT entered here: Profit already counts them as costs, so counting them twice would
// understate the return on marketing.
// Ad figures (v400): impressions, clicks and reach are optional per spend entry, copied from the ad platform. Only the entries that
// recorded a figure take part in that metric, so nothing is guessed.
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
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

/** A whole-number figure from the ad platform: blank is "not recorded"; anything else must be a whole number, 0 or more. */
function optionalCount(v, label) {
  if (v === '' || v === null || v === undefined) return { value: undefined };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) return { error: `${label} must be a whole number, 0 or more.` };
  return { value: n };
}

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
  const campaign = campaignKey(raw.campaign);
  const imp = optionalCount(raw.impressions, 'Impressions');
  if (imp.error) return { error: imp.error };
  const clk = optionalCount(raw.clicks, 'Clicks');
  if (clk.error) return { error: clk.error };
  const reach = optionalCount(raw.reach, 'Reach');
  if (reach.error) return { error: reach.error };
  if (clk.value !== undefined && imp.value === undefined) return { error: 'Enter impressions too, to work out click-through rate.' };
  if (reach.value !== undefined && imp.value === undefined) return { error: 'Enter impressions too, to work out ad frequency.' };
  if (imp.value !== undefined && clk.value !== undefined && clk.value > imp.value) return { error: 'Clicks cannot be more than impressions.' };
  if (imp.value !== undefined && reach.value !== undefined && reach.value > imp.value) return { error: 'Reach cannot be more than impressions.' };
  const entry = { channel, amount: Math.round(amount * 100) / 100, month, note, campaign, recurring: raw.recurring === true };
  if (imp.value !== undefined) entry.impressions = imp.value;
  if (clk.value !== undefined) entry.clicks = clk.value;
  if (reach.value !== undefined) entry.reach = reach.value;
  return { entry };
}

/** One campaign name, as it is matched everywhere (enquiries, deals and spend): trimmed, lower case, single spaces, 60 characters. */
export function campaignKey(v) {
  return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60);
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
 *   costPerInboundWin: number|null, outboundSpend90: number, outboundWins90: number, costPerOutboundWin: number|null,
 *   wonValue90: number, roas: number|null, inboundRoas: number|null, outboundRoas: number|null, byChannel: object[],
 *   adSpend90: number, impressions90: number, cpm: number|null, cpc: number|null, ctrPct: number|null,
 *   adFrequency: number|null, costPerAcquisition: number|null }}
 *   ROAS = value of the deals won in the window / what was spent in the window (e.g. 3 = 3 won for each 1 spent).
 *   Null when nothing was spent. Deals carry their source (inbound or email), not a campaign, so ROAS is per source, not per campaign.
 *   Ad metrics (v400): CPM = spend on entries with impressions per 1,000 impressions; CPC = spend on entries with clicks per click;
 *   CTR = clicks over the impressions of those same entries, in %; ad frequency = impressions over reach, where reach is summed
 *   per entry (a person reached in two months is counted twice, so frequency is a little low over several months).
 *   Cost per acquisition is the cost per won customer (same as cost per win).
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
  // Outbound: what the outreach tools cost (email, enrichment, messaging credits) against the wins that came from email.
  const outboundWins = wins.filter((d) => d.source === 'email').length;
  const outboundSpend = byChannel.filter((c) => c.source === 'email').reduce((a, c) => a + c.amount, 0);
  // Referral share (v398): the share of wins that came through a referral, the measurable part of word-of-mouth growth.
  // It is a proxy: the app does not track invitations sent, so a true virality coefficient cannot be worked out.
  const referralWins = wins.filter((d) => d.source === 'referral').length;

  // Return on ad spend: the value won (quoted deal value) over what was spent, overall and for inbound and outbound.
  const valueOf = (list) => list.reduce((a, d) => a + (Number(d.value) || 0), 0);
  const wonValue = Math.round(valueOf(wins));
  const roasOf = (value, spent) => (spent > 0 && value > 0 ? Math.round((value / spent) * 100) / 100 : null);

  // Ad metrics (v400). Each one uses only the spend entries that recorded that figure.
  const sumOf = (list, f) => list.reduce((a, e) => a + (Number(f(e)) || 0), 0);
  const withImp = rows.filter((e) => Number.isInteger(e.impressions));
  const withClicks = rows.filter((e) => Number.isInteger(e.clicks));
  const withReach = rows.filter((e) => Number.isInteger(e.reach));
  const adSpend = sumOf(withImp, (e) => e.amount);
  const impressions = sumOf(withImp, (e) => e.impressions);
  const clickSpend = sumOf(withClicks, (e) => e.amount);
  const clicks = sumOf(withClicks, (e) => e.clicks);
  const clickImpressions = sumOf(withClicks, (e) => e.impressions);
  const reachImpressions = sumOf(withReach, (e) => e.impressions);
  const reach = sumOf(withReach, (e) => e.reach);
  const cpm = impressions > 0 && adSpend > 0 ? r2((adSpend / impressions) * 1000) : null;
  const cpc = clicks > 0 && clickSpend > 0 ? r2(clickSpend / clicks) : null;
  const ctrPct = clickImpressions > 0 ? r1((clicks / clickImpressions) * 100) : null;
  const adFrequency = reach > 0 && reachImpressions > 0 ? r2(reachImpressions / reach) : null;

  // Per campaign: the spend entered with that campaign name, and the won deals that came in under it (first touch: the enquiry's campaign).
  const campaignNames = new Set();
  for (const e of rows) if (campaignKey(e.campaign)) campaignNames.add(campaignKey(e.campaign));
  for (const d of wins) if (campaignKey(d.campaign)) campaignNames.add(campaignKey(d.campaign));
  const byCampaign = [...campaignNames].sort().map((name) => {
    const spent = Math.round(rows.filter((e) => campaignKey(e.campaign) === name).reduce((a, e) => a + Number(e.amount), 0));
    const won = wins.filter((d) => campaignKey(d.campaign) === name);
    const value = Math.round(valueOf(won));
    return {
      campaign: name, spend: spent, wins: won.length, wonValue: value,
      roas: roasOf(value, spent), costPerWin: spent > 0 && won.length > 0 ? Math.round(spent / won.length) : null,
    };
  });

  const blendedCostPerWin = total > 0 && wins.length > 0 ? Math.round(total / wins.length) : null;
  return {
    ready: total > 0 && wins.length > 0,
    byCampaign,
    wonValue90: wonValue,
    referralSharePct: wins.length > 0 ? Math.round((referralWins / wins.length) * 1000) / 10 : null,
    roas: roasOf(wonValue, total),
    inboundRoas: roasOf(valueOf(wins.filter((d) => d.source === 'inbound')), inboundSpend),
    outboundRoas: roasOf(valueOf(wins.filter((d) => d.source === 'email')), outboundSpend),
    months: ms,
    monthsEntered,
    partial: monthsEntered < ms.length, // a month left empty means the cost per win is overstated: say so
    spend90: Math.round(total),
    wins90: wins.length,
    blendedCostPerWin,
    costPerAcquisition: blendedCostPerWin,
    adSpend90: Math.round(adSpend),
    impressions90: impressions,
    cpm,
    cpc,
    ctrPct,
    adFrequency,
    inboundWins90: inboundWins,
    inboundSpend90: inboundSpend,
    costPerInboundWin: inboundSpend > 0 && inboundWins > 0 ? Math.round(inboundSpend / inboundWins) : null,
    outboundSpend90: outboundSpend,
    outboundWins90: outboundWins,
    costPerOutboundWin: outboundSpend > 0 && outboundWins > 0 ? Math.round(outboundSpend / outboundWins) : null,
    byChannel,
  };
}
