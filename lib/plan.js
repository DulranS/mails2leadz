// lib/plan.js - "what does it take to hit my goal?" for COLD OUTREACH, worked backwards from the owner's own results.
// wins needed -> qualified conversations needed -> replies needed -> emails needed, using only rates the owner really achieved.
// No invented benchmarks: with too little data it says so and shows what is missing. Pure; no network.

const QUALIFIED_PLUS = ['qualified', 'demo', 'proposal', 'negotiation', 'closed_won', 'won'];
export const PLAN_MIN = { emailed: 50, replied: 5, qualified: 3, won: 1 };
const WEEKS_PER_MONTH = 4.33;

/**
 * @param {Array}  emailRows  [{to, replied, t}] every sent email row (t = ms)
 * @param {Array}  deals      normalised deals from computeBusinessMetrics: {email, stage, reached[], value, estimated}
 * @param {number} goal       monthly revenue goal (0 = none set)
 * @param {number} avgDealValue  fallback when there are too few real wins to average
 */
export function computeOutboundPlan({ emailRows = [], deals = [], goal = 0, avgDealValue = 0, now = Date.now() } = {}) {
  const emailed = new Set();
  const replied = new Set();
  let last28 = 0;
  const seenRecent = new Set();
  for (const e of emailRows) {
    const to = String(e.to || '').toLowerCase();
    if (!to) continue;
    emailed.add(to);
    if (e.replied) replied.add(to);
    if (e.t && now - e.t <= 28 * 86400000 && !seenRecent.has(to)) { seenRecent.add(to); last28++; }
  }
  const mine = deals.filter((d) => emailed.has(String(d.email).toLowerCase()) && !d.optedOut);
  const reachedQ = (d) => QUALIFIED_PLUS.includes(d.stage) || (d.reached || []).some((r) => QUALIFIED_PLUS.includes(r));
  const qualified = mine.filter(reachedQ);
  const won = mine.filter((d) => d.stage === 'closed_won' || d.stage === 'won' || (d.stage && String(d.stage).startsWith('closed_won')));
  const realWon = won.filter((d) => !d.estimated);

  const counts = { emailed: emailed.size, replied: replied.size, qualified: qualified.length, won: won.length };
  const missing = [];
  if (!(goal > 0)) missing.push('Set a monthly goal in Account.');
  if (counts.emailed < PLAN_MIN.emailed) missing.push(`Email at least ${PLAN_MIN.emailed} different leads (so far ${counts.emailed}).`);
  if (counts.replied < PLAN_MIN.replied) missing.push(`Get at least ${PLAN_MIN.replied} replies (so far ${counts.replied}).`);
  if (counts.qualified < PLAN_MIN.qualified) missing.push(`Qualify at least ${PLAN_MIN.qualified} conversations (so far ${counts.qualified}).`);
  if (counts.won < PLAN_MIN.won) missing.push(`Win at least ${PLAN_MIN.won} deal from cold email (so far ${counts.won}).`);
  const sendsPerWeekNow = Math.round((last28 / 4) * 10) / 10;
  if (missing.length) return { ready: false, missing, counts, sendsPerWeekNow };

  const rates = { reply: counts.replied / counts.emailed, qualify: Math.min(1, counts.qualified / counts.replied), win: Math.min(1, counts.won / counts.qualified) };
  const avgWon = realWon.length >= 3 ? realWon.reduce((a, d) => a + d.value, 0) / realWon.length : Number(avgDealValue) > 0 ? Number(avgDealValue) : won.reduce((a, d) => a + d.value, 0) / won.length;
  const winsPerMonth = goal / avgWon;
  const qualifiedPerMonth = winsPerMonth / rates.win;
  const repliesPerMonth = qualifiedPerMonth / rates.qualify;
  const sendsPerMonth = repliesPerMonth / rates.reply;
  const sendsPerWeek = sendsPerMonth / WEEKS_PER_MONTH;
  const r1 = (n) => Math.round(n * 10) / 10;
  return {
    ready: true,
    counts,
    rates,
    avgWon: Math.round(avgWon),
    avgWonIsDefault: realWon.length < 3,
    monthly: { wins: r1(winsPerMonth), qualified: r1(qualifiedPerMonth), replies: r1(repliesPerMonth), sends: Math.ceil(sendsPerMonth) },
    weekly: { sends: Math.ceil(sendsPerWeek) },
    perWorkingDay: { sends: Math.ceil(sendsPerWeek / 5) },
    sendsPerWeekNow,
    gapPerWeek: Math.ceil(sendsPerWeek) - sendsPerWeekNow,
  };
}
