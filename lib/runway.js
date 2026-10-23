// lib/runway.js - how long the money lasts. The one number that decides how many experiments you get. Uses the cash figure the owner
// types in (and dates), and the profit view's monthly result, so it is only as true as those. Never guessed: no cash figure, no runway.
const DAY = 86400000;
const r0 = (n) => Math.round(n);
export const STALE_DAYS = 30;

/**
 * @param {{ cashOnHand?: number|string, cashAsOf?: string, netMonthly?: number, operatingMonthly?: number, profitReady?: boolean, owedToYou?: number, now?: number }} a
 *   netMonthly: average monthly profit after running costs (negative = losing money); operatingMonthly: what the business costs to run each month
 */
export function computeRunway({ cashOnHand = null, cashAsOf = '', netMonthly = 0, operatingMonthly = 0, profitReady = false, owedToYou = 0, now = Date.now() } = {}) {
  const cash = Number(cashOnHand);
  if (cashOnHand === null || cashOnHand === '' || !Number.isFinite(cash) || cash < 0) return { set: false };
  const asOf = Date.parse(cashAsOf || '');
  const staleDays = Number.isFinite(asOf) ? Math.floor((now - asOf) / DAY) : null;
  const stale = staleDays !== null && staleDays > STALE_DAYS;
  // With no costs entered and nothing measured we cannot say what the burn is.
  const burnKnown = profitReady || Number(operatingMonthly) > 0;
  const net = profitReady ? Number(netMonthly) : -Number(operatingMonthly || 0);
  const burn = Math.max(0, -net);
  const owed = Math.max(0, Number(owedToYou) || 0);
  // The harshest honest question: if every sale stopped today, how long would the cash last on running costs alone?
  const opM = Math.max(0, Number(operatingMonthly) || 0);
  const monthsIfNoSales = opM > 0 ? Math.round((cash / opM) * 10) / 10 : null;
  const base = { monthsIfNoSales, set: true, cash: r0(cash), stale, staleDays, owedToYou: r0(owed), netMonthly: r0(net), burnMonthly: r0(burn), basedOnProfit: !!profitReady };
  if (!burnKnown) return { ...base, state: 'unknown', months: null, message: 'Enter what the business costs to run each month (Account) to see how long your cash lasts.' };
  if (burn === 0) return { ...base, state: 'profitable', months: null, message: 'You are not losing money at the current rate, so there is no countdown. Keep it that way while you test.' };
  const months = cash / burn;
  const withOwed = (cash + owed) / burn;
  const state = months >= 12 ? 'ok' : months >= 6 ? 'watch' : 'short';
  const m1 = Math.round(months * 10) / 10;
  return { ...base, state, months: m1, monthsWithOwed: owed > 0 ? Math.round(withOwed * 10) / 10 : null, message: state === 'short'
    ? `At this rate your cash lasts about ${m1} months. Cut costs or get paid sooner now, and run only the experiments that can pay quickly.`
    : state === 'watch' ? `Your cash lasts about ${m1} months at this rate. Enough to run a few tests, not enough to wait.`
    : `Your cash lasts about ${m1} months at this rate.` };
}
