// lib/weekly-kpi.js - "how did this week go?" in one table: last 7 days against the 7 days before.
// Pure functions over the owner's real data. A figure the data cannot support shows as not tracked, never as a guess.

import { WON_STAGES, normalizeStage } from './deal-utils.js';

const DAY = 86400000;
const toMs = (v) => {
  if (!v) return null;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};
const QUALIFIED_OR_LATER = ['qualified', 'demo', 'proposal', 'negotiation', ...WON_STAGES];
const DEMO_OR_LATER = ['demo', 'proposal', 'negotiation', ...WON_STAGES];

/** Earliest time a deal reached any of these stages (only known for deals saved with stage times). */
function firstReached(deal, stages) {
  const t = deal?.stageTimes;
  if (!t || typeof t !== 'object') return null;
  let best = null;
  for (const s of stages) {
    const ms = toMs(t[s]);
    if (ms && (best === null || ms < best)) best = ms;
  }
  return best;
}

export function computeWeeklyKpis({ emailRows = [], deals = [], invoices = [], avgDealValue = 1000, now = Date.now() } = {}) {
  const avg = Number(avgDealValue) > 0 ? Number(avgDealValue) : 1000;
  const inCur = (ms) => ms !== null && ms !== undefined && ms > now - 7 * DAY && ms <= now;
  const inPrev = (ms) => ms !== null && ms !== undefined && ms > now - 14 * DAY && ms <= now - 7 * DAY;
  const count = (items, at) => ({ cur: items.filter((x) => inCur(at(x))).length, prev: items.filter((x) => inPrev(at(x))).length });
  const total = (items, at, val) => ({
    cur: items.filter((x) => inCur(at(x))).reduce((a, x) => a + val(x), 0),
    prev: items.filter((x) => inPrev(at(x))).reduce((a, x) => a + val(x), 0),
  });

  // one deal per email, latest wins
  const byEmail = new Map();
  for (const d of deals) {
    if (!d?.email) continue;
    const k = String(d.email).toLowerCase();
    const p = byEmail.get(k);
    if (!p || (toMs(d.lastUpdate) || 0) >= (toMs(p.lastUpdate) || 0)) byEmail.set(k, d);
  }
  const all = [...byEmail.values()].map((d) => {
    const hasValue = Number(d.value) > 0 && d.valueIsEstimate !== true;
    return { ...d, _stage: normalizeStage(d.stage), _value: hasValue ? Number(d.value) : avg, _estimated: !hasValue };
  });
  const won = all.filter((d) => WON_STAGES.includes(d._stage));
  const lost = all.filter((d) => d._stage === 'closed_lost' && d.lostReason !== 'unsubscribed' && d.lostReason !== 'bounced');

  const sent = count(emailRows, (r) => r.t);
  // replies are placed by the day they were detected; older rows without that date are left out rather than guessed
  const repliedRows = emailRows.filter((r) => r.replied && r.repliedAt);
  const seenReply = new Set();
  const uniqueReplies = repliedRows.filter((r) => (seenReply.has(r.to) ? false : (seenReply.add(r.to), true)));
  const replies = count(uniqueReplies, (r) => toMs(r.repliedAt));
  const qualified = count(all, (d) => firstReached(d, QUALIFIED_OR_LATER));
  const demos = count(all, (d) => firstReached(d, DEMO_OR_LATER));
  const wonCount = count(won, (d) => toMs(d.closedAt));
  const wonRevenue = total(won, (d) => toMs(d.closedAt), (d) => d._value);
  const lostCount = count(lost, (d) => toMs(d.closedAt));
  const live = invoices.filter((i) => i && i.status !== 'void');
  const invoiced = total(live, (i) => toMs(i.issuedAt) ?? toMs(i.createdAt), (i) => Number(i.amount) || 0);
  const collected = total(live.filter((i) => i.status === 'paid'), (i) => toMs(i.paidAt), (i) => Number(i.amount) || 0);
  const touches = count(won, (d) => toMs(d.lastTouchAt));

  const estimatedWonThisWeek = won.filter((d) => inCur(toMs(d.closedAt)) && d._estimated).length;

  const rows = [
    { key: 'sent', label: 'Emails sent', kind: 'count', ...sent },
    { key: 'replies', label: 'Replies received', kind: 'count', ...replies },
    { key: 'qualified', label: 'Newly qualified', kind: 'count', ...qualified },
    { key: 'demos', label: 'Reached demo / meeting', kind: 'count', ...demos },
    { key: 'won', label: 'Deals won', kind: 'count', ...wonCount },
    { key: 'wonRevenue', label: 'Revenue won', kind: 'money', ...wonRevenue },
    { key: 'lost', label: 'Deals lost', kind: 'count', ...lostCount, lowerIsBetter: true },
    { key: 'invoiced', label: 'Invoiced', kind: 'money', ...invoiced },
    { key: 'collected', label: 'Cash collected', kind: 'money', ...collected },
    { key: 'touches', label: 'Customer check-ins logged', kind: 'count', ...touches },
  ].map((r) => {
    const diff = r.cur - r.prev;
    const direction = diff === 0 ? 'flat' : diff > 0 ? 'up' : 'down';
    const good = diff === 0 ? null : r.lowerIsBetter ? diff < 0 : diff > 0;
    return { ...r, cur: Math.round(r.cur * 100) / 100, prev: Math.round(r.prev * 100) / 100, diff: Math.round(diff * 100) / 100, direction, good, pct: r.prev > 0 ? diff / r.prev : null };
  });

  const noActivity = rows.every((r) => r.cur === 0 && r.prev === 0);
  return { rows, noActivity, estimatedWonThisWeek, byKey: Object.fromEntries(rows.map((r) => [r.key, r])) };
}

/** Two or three plain sentences: what happened, and what needs attention right now. */
export function weeklyHeadline({ kpis, snapshot = {}, money }) {
  const k = kpis.byKey;
  const parts = [];
  if (kpis.noActivity) return 'No activity recorded in the last two weeks.';
  if (k.won.cur > 0) parts.push(`Won ${k.won.cur} deal${k.won.cur === 1 ? '' : 's'} worth ${money(k.wonRevenue.cur)}${k.won.prev > 0 ? ` (last week: ${k.won.prev})` : ''}.`);
  else parts.push(`No deals won this week${k.won.prev > 0 ? ` (last week: ${k.won.prev})` : ''}.`);
  if (k.sent.cur > 0 || k.replies.cur > 0) parts.push(`${k.sent.cur} email${k.sent.cur === 1 ? '' : 's'} sent, ${k.replies.cur} repl${k.replies.cur === 1 ? 'y' : 'ies'}.`);
  if (k.collected.cur > 0) parts.push(`Collected ${money(k.collected.cur)}.`);
  if (snapshot.overdueCount > 0) parts.push(`${snapshot.overdueCount} invoice${snapshot.overdueCount === 1 ? ' is' : 's are'} overdue (${money(snapshot.overdueAmount)}).`);
  else if (snapshot.atRiskCount > 0) parts.push(`${snapshot.atRiskCount} customer${snapshot.atRiskCount === 1 ? ' is' : 's are'} at risk.`);
  return parts.slice(0, 4).join(' ');
}

/** Plain-text weekly report for copying or emailing to yourself (no special characters). */
export function weeklyReportText({ kpis, snapshot = {}, money, businessName = '', now = Date.now() }) {
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const fmt = (r) => (r.kind === 'money' ? money(r.cur) : String(r.cur));
  const fmtPrev = (r) => (r.kind === 'money' ? money(r.prev) : String(r.prev));
  const lines = [
    `Weekly report${businessName ? ` - ${businessName}` : ''}`,
    `${day(now - 7 * DAY)} to ${day(now)} (compared with the 7 days before)`,
    '',
    weeklyHeadline({ kpis, snapshot, money }),
    '',
    'THIS WEEK vs LAST WEEK',
    ...kpis.rows.map((r) => `- ${r.label}: ${fmt(r)} (last week ${fmtPrev(r)})`),
    '',
    'RIGHT NOW',
    snapshot.openCount !== undefined ? `- Open pipeline: ${money(snapshot.openValue || 0)} across ${snapshot.openCount} deal${snapshot.openCount === 1 ? '' : 's'}, ${money(snapshot.weighted || 0)} weighted` : null,
    snapshot.forecast30 !== undefined ? `- Expected in the next 30 days: ${money(snapshot.forecast30)}` : null,
    snapshot.outstanding !== undefined ? `- Money owed to you: ${money(snapshot.outstanding)}, of which overdue ${money(snapshot.overdueAmount || 0)}` : null,
    snapshot.customers !== undefined ? `- Customers: ${snapshot.customers}, at risk ${snapshot.atRiskCount || 0}, open support issues ${snapshot.openIssues || 0}` : null,
  ].filter((l) => l !== null);
  return lines.join('\n');
}
