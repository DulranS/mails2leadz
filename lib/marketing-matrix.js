// lib/marketing-matrix.js (v402): the four ways to get customers, from your marketing spend. Each cell is warm or cold, one-to-one or one-to-many,
// and free or paid. Each spend channel is placed in one cell by a rule written here (our classification, not a standard). Change the
// CHANNEL_CELL map if your view differs. Spend in "other" is kept apart and not placed. Pure.
export const MATRIX_CELLS = [
  { id: 'warm_one_to_one', label: 'Warm, one-to-one', example: 'Direct follow-up with people who already know you (referrals are not in spend yet)' },
  { id: 'cold_one_to_one', label: 'Cold, one-to-one', example: 'Outreach to people who do not know you yet' },
  { id: 'free_one_to_many', label: 'Free, one-to-many', example: 'Content and social posts' },
  { id: 'paid_one_to_many', label: 'Paid, one-to-many', example: 'Ads and sponsored events' },
];

export const CHANNEL_CELL = {
  paid_ads: 'paid_one_to_many',
  content: 'free_one_to_many',
  outreach_tools: 'cold_one_to_one',
  events: 'paid_one_to_many',
};

const r1 = (n) => Math.round(n * 10) / 10;
const money = (n) => Math.round(n * 100) / 100;

/**
 * Spend by cell over the given months. `spend` is [{ channel, month, amount }]. Share is of all spend in those months, including "other".
 * @returns {{ cells: object[], unplaced: { amount: number, sharePct: number|null }, total: number }}
 */
export function marketingMatrix({ spend = [], months = [] } = {}) {
  const inWindow = new Set(months);
  const byCell = new Map(MATRIX_CELLS.map((c) => [c.id, 0]));
  let unplaced = 0;
  for (const s of spend) {
    if (!inWindow.has(s.month) || !Number.isFinite(s.amount) || s.amount <= 0) continue;
    const cell = CHANNEL_CELL[s.channel];
    if (cell) byCell.set(cell, byCell.get(cell) + s.amount);
    else unplaced += s.amount;
  }
  const total = [...byCell.values()].reduce((t, v) => t + v, 0) + unplaced;
  const share = (amt) => (total > 0 ? r1((amt / total) * 100) : null);
  return {
    cells: MATRIX_CELLS.map((c) => ({ ...c, amount: money(byCell.get(c.id)), sharePct: share(byCell.get(c.id)) })),
    unplaced: { amount: money(unplaced), sharePct: share(unplaced) },
    total: money(total),
  };
}
