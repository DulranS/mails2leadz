// lib/kpi-scorecard.js - the sales and marketing KPIs for one calendar month, in one place. Pure. Read-only.
const DAY = 86400000;
const r1 = (n) => Math.round(n * 10) / 10;
const ms = (v) => { if (!v) return null; const t = Date.parse(v); return Number.isFinite(t) ? t : null; };
const inMonth = (t, year, month) => { if (t === null) return false; const d = new Date(t); return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month; };

export function kpiScorecard({ leads = [], deals = [], year, month } = {}) {
  const newLeads = (Array.isArray(leads) ? leads : []).filter((l) => inMonth(ms(l?.receivedAt), year, month)).length;
  const dealsMade = (Array.isArray(deals) ? deals : []).filter((d) => d && inMonth(ms(d.createdAt), year, month));
  const won = (Array.isArray(deals) ? deals : []).filter((d) => d && d.stage === 'closed_won' && inMonth(ms(d.stageTimes?.closed_won) ?? ms(d.closedAt), year, month));
  const lost = (Array.isArray(deals) ? deals : []).filter((d) => d && d.stage === 'closed_lost' && inMonth(ms(d.lostAt) ?? ms(d.stageTimes?.closed_lost), year, month));
  const cycles = won.map((d) => (ms(d.stageTimes?.closed_won) ?? ms(d.closedAt)) - ms(d.createdAt)).filter((x) => Number.isFinite(x) && x >= 0).map((x) => x / DAY);
  const wonValue = won.reduce((a, d) => a + (Number(d.value) || 0), 0);
  return {
    newLeads,
    dealsOpened: dealsMade.length,
    leadToDealPct: newLeads ? r1((dealsMade.length / newLeads) * 100) : null,
    won: won.length,
    lost: lost.length,
    winRatePct: won.length + lost.length ? r1((won.length / (won.length + lost.length)) * 100) : null,
    avgCycleDays: cycles.length ? r1(cycles.reduce((a, b) => a + b, 0) / cycles.length) : null,
    avgWonValue: won.length ? Math.round((wonValue / won.length) * 100) / 100 : null,
    wonValue: Math.round(wonValue * 100) / 100,
  };
}

export function scorecardText(k) {
  const pct = (x) => (x === null ? 'n/a' : `${x}%`);
  const days = (x) => (x === null ? 'n/a' : `${x} days`);
  return [
    `- Leads in: ${k.newLeads}. Deals opened: ${k.dealsOpened} (lead to deal ${pct(k.leadToDealPct)}).`,
    `- Won: ${k.won} for ${k.wonValue.toFixed(2)} (average ${k.avgWonValue === null ? 'n/a' : k.avgWonValue.toFixed(2)}). Lost: ${k.lost}. Win rate ${pct(k.winRatePct)}.`,
    `- Average time to win: ${days(k.avgCycleDays)}.`,
  ];
}
