// lib/sales-kpis.js - the sales and marketing measures on one screen: pipeline, buy and sell side, support and speed. Pure.
const DAY = 86400000;
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

// The window for the "won" figures: the owner's look-back (3, 6 or 12 months) or an exact from-to range (pass 338).
// Defaults to the last 365 days, as before, so a call with no window is unchanged.
export function salesKpis({ deals = [], leads = [], targets = [], tickets = [], now = Date.now(), windowStart, windowEnd, windowLabel = 'last 12 months' } = {}) {
  const open = deals.filter((d) => d && d.stage !== 'closed_won' && d.stage !== 'closed_lost');
  const won = deals.filter((d) => d && d.stage === 'closed_won');
  const lost = deals.filter((d) => d && d.stage === 'closed_lost');
  const end = Number.isFinite(windowEnd) ? windowEnd : now;
  const start = Number.isFinite(windowStart) ? windowStart : end - 365 * DAY;
  const wonInWindow = won.filter((d) => {
    const t = Date.parse(d.stageTimes?.closed_won || d.closedAt || '') || 0;
    return t >= start && t < end;
  });
  const won12 = wonInWindow;
  const newLeads = leads.filter((l) => l && l.status === 'new').length;
  const answeredLeads = leads.filter((l) => l && l.status && l.status !== 'new').length;
  const buy = targets.filter((t) => t && t.side === 'buy');
  const boughtThenSold = buy.filter((t) => t.stage === 'closed_won' && Number(t.actualSale) > 0 && Number(t.totalCost) > 0);
  const realisedMargin = boughtThenSold.length ? money(boughtThenSold.reduce((a, t) => a + ((Number(t.actualSale) - Number(t.totalCost)) / Number(t.totalCost)), 0) / boughtThenSold.length * 100) : null;
  const support = tickets.filter((t) => t && t.status !== 'resolved');
  return {
    pipeline: { open: open.length, value: money(open.reduce((a, d) => a + (Number(d.value) || 0), 0)) },
    sales: { wonLast12Months: won12.length, wonValueLast12Months: money(won12.reduce((a, d) => a + (Number(d.value) || 0), 0)), windowLabel, winRatePct: won.length + lost.length ? money((won.length / (won.length + lost.length)) * 100) : null },
    speed: { newLeadsWaiting: newLeads, leadsAnswered: answeredLeads },
    buySide: { tracked: buy.length, inOffer: buy.filter((t) => t.stage === 'offer').length, realisedMarginPct: realisedMargin },
    support: { open: support.length },
  };
}
