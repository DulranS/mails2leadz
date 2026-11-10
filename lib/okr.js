// lib/okr.js - objectives and key results measured from the owner's own figures. Pure. A key result with no figure yet is shown as not measured, never as zero.
export const METRICS = {
  revenue_month: { label: 'Revenue a month (twelve-month average)', from: (k) => (k.sales?.wonValueLast12Months ?? null) === null ? null : Math.round((k.sales.wonValueLast12Months / 12) * 100) / 100 },
  new_customers_month: { label: 'New customers a month', from: (k, m) => (m.newCustomersLast12Months ?? null) === null ? null : Math.round((m.newCustomersLast12Months / 12) * 10) / 10 },
  win_rate: { label: 'Win rate, %', from: (k) => k.sales?.winRatePct ?? null },
  paid_share: { label: 'Share of wins from paid channels, %', from: (k, m) => m.channelMix?.paidSharePct ?? null },
  ltv: { label: 'Lifetime value per customer', from: (k, m) => m.ltv ?? null },
};

/** Each key result: its current figure, its target, and how far along it is (capped at 100%). Direction: 'up' means higher is better. */
export function okrProgress(objectives = [], kpis = {}, money = {}) {
  return (Array.isArray(objectives) ? objectives : []).map((o) => ({
    objective: String(o.objective || '').slice(0, 160),
    keyResults: (Array.isArray(o.keyResults) ? o.keyResults : []).map((kr) => {
      const metric = METRICS[kr.metric];
      const current = metric ? metric.from(kpis, money) : null;
      const target = Number(kr.target);
      const pct = current === null || !(target > 0) ? null : Math.min(100, Math.round((current / target) * 100));
      return { label: metric ? metric.label : 'Unknown measure', target, current, pct, measured: current !== null };
    }),
  }));
}
