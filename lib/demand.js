// lib/demand.js - whether demand is rising or falling, from the leads you actually received. Pure.
const DAY = 86400000;

/** Leads in the last 30 days against the 30 before, and where they came from. */
export function demandTrend(leads = [], now = Date.now()) {
  const list = Array.isArray(leads) ? leads : [];
  const at = (l) => Date.parse(l.receivedAt || l.createdAt || '') || 0;
  const last = list.filter((l) => at(l) >= now - 30 * DAY).length;
  const prev = list.filter((l) => at(l) < now - 30 * DAY && at(l) >= now - 60 * DAY).length;
  const changePct = prev ? Math.round(((last - prev) / prev) * 100) : null;
  const sources = {};
  for (const l of list.filter((x) => at(x) >= now - 30 * DAY)) { const s = String(l.source || 'unrecorded'); sources[s] = (sources[s] || 0) + 1; }
  const topSources = Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([source, count]) => ({ source, count }));
  const direction = changePct === null ? (last ? 'new' : 'none') : changePct > 10 ? 'rising' : changePct < -10 ? 'falling' : 'steady';
  return { last30: last, prev30: prev, changePct, direction, topSources };
}
