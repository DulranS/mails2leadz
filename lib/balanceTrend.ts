// Balance sheet trend checks (passes 351–352): the owner's "5 questions to ask of a balance sheet", checked against the app's figures.
// Measured exactly:
//   - receivables growing faster than sales, and borrowing rising fast: both rebuilt as at the date three months back
//     (computeReceivablesAging and computeLoanSummary take a date).
//   - shareholders' equity falling: the equity movement over the last three months, from profit plus owner money in, less owner money out
//     (the caller computes it from dated profit and capital entries). It excludes unrealised investment gains, which are not dated.
// Not measured, on purpose: total assets. Stock and the market value of investments are held only as today's totals, so an earlier
// figure would be a guess. That check says so rather than guess. Pure.
import type { FlagMonth, FlagResult } from "./redFlags";

export interface TrendPrior { accountsReceivable: number; loansPayable: number }
export interface TrendNow { accountsReceivable: number; loansPayable: number }

const pctChange = (now: number, before: number) => (before !== 0 ? ((now - before) / Math.abs(before)) * 100 : null);

/**
 * The last day of the month `monthsBack` months before the month of `todayISO` (YYYY-MM-DD), e.g. 2026-11-21 with 3 gives 2026-08-31.
 */
export function priorMonthEnd(todayISO: string, monthsBack = 3): string {
  const [y, m] = todayISO.slice(0, 7).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - monthsBack + 1, 0)); // day 0 of the next month is the last day of this one
  return d.toISOString().slice(0, 10);
}

export function balanceTrendFlags(
  months: FlagMonth[],
  now: TrendNow,
  prior: TrendPrior | null | undefined,
  equityChange?: number | null,
): FlagResult[] {
  const sorted = [...months].sort((a, c) => a.month.localeCompare(c.month));
  const last3 = sorted.slice(-3), prior3 = sorted.slice(-6, -3);
  const out: FlagResult[] = [];

  // Receivables growing faster than sales: receivables now against the figure at the end of the month three months back;
  // sales the last three months against the three before them (the same windows the other trend checks use).
  const arLabel = "Receivables growing faster than sales (over 10 points)";
  if (!prior) {
    out.push({ id: "receivables_vs_sales", label: arLabel, status: "not_measured", detail: "No receivables figure from three months back." });
  } else if (last3.length < 3 || prior3.length < 3) {
    out.push({ id: "receivables_vs_sales", label: arLabel, status: "not_measured", detail: "Needs six months of figures." });
  } else {
    const arG = pctChange(now.accountsReceivable, prior.accountsReceivable);
    const revNow = last3.reduce((t, m) => t + m.revenue, 0), revBefore = prior3.reduce((t, m) => t + m.revenue, 0);
    const revG = pctChange(revNow, revBefore);
    if (arG === null || revG === null) {
      out.push({ id: "receivables_vs_sales", label: arLabel, status: "not_measured", detail: "Needs receivables and sales in both periods." });
    } else {
      out.push({
        id: "receivables_vs_sales", label: arLabel,
        status: arG - revG > 10 ? "flag" : "ok",
        detail: `Receivables ${arG.toFixed(1)}% since three months back; sales ${revG.toFixed(1)}% over the last three months against the three before.`,
      });
    }
  }

  // Borrowing rising fast: loans now against the balance three months back. A rise over 20% is flagged; new borrowing from nothing is flagged too.
  const loanLabel = "Borrowing rising fast (over 20% in three months)";
  if (!prior) {
    out.push({ id: "borrowing_growth", label: loanLabel, status: "not_measured", detail: "No loan balance from three months back." });
  } else if (prior.loansPayable <= 0) {
    out.push({
      id: "borrowing_growth", label: loanLabel,
      status: now.loansPayable > 0 ? "flag" : "ok",
      detail: now.loansPayable > 0 ? "New borrowing since three months back." : "No loans then or now.",
    });
  } else {
    const g = pctChange(now.loansPayable, prior.loansPayable);
    out.push({
      id: "borrowing_growth", label: loanLabel,
      status: g !== null && g > 20 ? "flag" : "ok",
      detail: g === null ? "No loan balance to compare." : `Loans ${g.toFixed(1)}% since three months back.`,
    });
  }

  // Total assets: not measured, on purpose (see the note at the top of this file).
  out.push({
    id: "assets_trend", label: "Total assets shrinking (over 10%)", status: "not_measured",
    detail: "Stock and the market value of investments are not kept as at an earlier date, so total assets cannot be compared exactly yet.",
  });

  // Equity: the movement over the last three months from profit and owner money (see the note at the top of this file).
  const eqLabel = "Shareholders' equity falling (profit less drawings, last three months)";
  if (equityChange === null || equityChange === undefined) {
    out.push({ id: "equity_trend", label: eqLabel, status: "not_measured", detail: "Needs three months of figures." });
  } else {
    const amt = Math.round(equityChange).toLocaleString("en-US");
    out.push({
      id: "equity_trend", label: eqLabel,
      status: equityChange < 0 ? "flag" : "ok",
      detail: `Equity moved ${amt} over the last three months from profit and owner money (unrealised investment gains not included).`,
    });
  }
  return out;
}
