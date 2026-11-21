// Early-warning lights, the cash "firewall", and a rough value range for the business.
//
// Everything here is arithmetic over figures the app already computes (monthly P&L, balance
// sheet, break-even / survival number, receivables aging). It creates no records, sends nothing
// and decides nothing: it turns numbers the owner already has into a short "what needs attention
// before it becomes a crisis" list, in plain words.
//
// Thresholds are deliberately simple and conservative rules of thumb, shown to the owner with the
// numbers behind them. They are guidance, not accounting or valuation advice.

export type WarningLevel = "ok" | "watch" | "act";

export interface Warning {
  id: "cash_cover" | "sales_vs_needed" | "margin_slip" | "slow_collections" | "losing_money" | "borrowers_late" | "stock_stuck";
  level: WarningLevel;
  title: string;
  detail: string;
}

export interface CashFirewall {
  monthlyNeed: number; // survival number if the owner records withdrawals, else fixed costs
  basis: "survival" | "fixed_costs";
  targetMonths: number;
  targetAmount: number;
  cash: number;
  coverMonths: number; // cash / monthlyNeed
  gap: number; // how much more cash to reach the target (0 when met)
  idleMonths: number; // the upper line: cash beyond this many months of cover is idle
  idleAmount: number; // how much cash sits above the upper line (0 when under it)
}

interface PnLMonthLike {
  month: string; // YYYY-MM
  totalRevenue: number;
  grossMarginPct: number | null;
  netProfitPreTax: number;
}

export interface EarlyWarningInput {
  asOf: string; // YYYY-MM-DD
  cash: number;
  monthlyPnL: PnLMonthLike[];
  monthlyFixedCosts: number;
  breakEvenRevenue: number;
  survival: { survivalNumber: number; survivalRevenue: number } | null;
  receivables: { totalOutstanding: number; byBucket: Record<string, number> };
  // Money the business has lent out (lib/lending.ts): what borrowers owe in total and how much of it is late.
  // Leave out when the business lends nothing.
  lending?: { owedTotal: number; overdueAmount: number; overdueCount: number };
  // Stock on hand and the part of it that has not sold for 90+ days (lib/inventoryInsights.ts).
  stock?: { totalValue: number; slowValue: number };
}

export const CASH_FIREWALL_TARGET_MONTHS = 3;
// The upper line. Cash is for protecting the business, not for sitting still: beyond this many months
// of cover the owner is told it could be put to work (never an instruction, and never a warning light).
export const CASH_FIREWALL_IDLE_MONTHS = 6;

const money = (n: number) => Math.round(n).toLocaleString("en-US");

// Months that are complete as of `asOf` (drops the current, still-filling month).
export function completedMonths<T extends { month: string }>(months: T[], asOf: string): T[] {
  const current = asOf.slice(0, 7);
  return months.filter((m) => m.month < current);
}

export function computeCashFirewall(input: EarlyWarningInput): CashFirewall | null {
  const basis = input.survival && input.survival.survivalNumber > 0 ? "survival" : "fixed_costs";
  const monthlyNeed = basis === "survival" ? input.survival!.survivalNumber : input.monthlyFixedCosts;
  if (!(monthlyNeed > 0)) return null;
  const cash = input.cash;
  const targetAmount = monthlyNeed * CASH_FIREWALL_TARGET_MONTHS;
  return {
    monthlyNeed,
    basis,
    targetMonths: CASH_FIREWALL_TARGET_MONTHS,
    targetAmount,
    cash,
    coverMonths: Math.max(cash, 0) / monthlyNeed,
    gap: Math.max(targetAmount - cash, 0),
    idleMonths: CASH_FIREWALL_IDLE_MONTHS,
    idleAmount: Math.max(cash - monthlyNeed * CASH_FIREWALL_IDLE_MONTHS, 0),
  };
}

export function computeEarlyWarnings(input: EarlyWarningInput): Warning[] {
  const out: Warning[] = [];
  const full = completedMonths(input.monthlyPnL, input.asOf);
  const last = full[full.length - 1];

  // 1. Cash cover - how long cash alone would keep the lights (and the owner) going.
  const fw = computeCashFirewall(input);
  if (fw) {
    const level: WarningLevel = fw.coverMonths < 1 ? "act" : fw.coverMonths < fw.targetMonths ? "watch" : "ok";
    const what = fw.basis === "survival" ? "your survival number" : "your monthly fixed costs";
    out.push({
      id: "cash_cover",
      level,
      title: level === "ok" ? "Cash cushion is healthy" : level === "watch" ? "Cash cushion is thin" : "Cash cushion is very low",
      detail:
        level === "ok"
          ? `Cash covers ${fw.coverMonths.toFixed(1)} months of ${what} (${money(fw.monthlyNeed)}/month) - at or above your ${fw.targetMonths}-month safety target.` +
            (fw.idleAmount > 0
              ? ` About ${money(fw.idleAmount)} sits above ${fw.idleMonths} months of cover. That cash could be working: use "how much cash can you actually put to work" on the Profitability page before committing it.`
              : "")
          : `Cash covers ${fw.coverMonths.toFixed(1)} months of ${what} (${money(fw.monthlyNeed)}/month). Aim for ${fw.targetMonths} months; that is ${money(fw.gap)} more than you hold today.`,
    });
  }

  // 2. Are sales reaching what the business needs?
  const neededRevenue =
    input.survival && Number.isFinite(input.survival.survivalRevenue) && input.survival.survivalRevenue > 0
      ? input.survival.survivalRevenue
      : input.breakEvenRevenue > 0
      ? input.breakEvenRevenue
      : 0;
  if (last && neededRevenue > 0) {
    const ratio = last.totalRevenue / neededRevenue;
    const level: WarningLevel = ratio >= 1 ? "ok" : ratio >= 0.85 ? "watch" : "act";
    out.push({
      id: "sales_vs_needed",
      level,
      title: level === "ok" ? "Sales are above what you need" : "Sales are below what you need",
      detail: `Last full month's sales were ${money(last.totalRevenue)} against ${money(neededRevenue)} needed to cover costs${
        input.survival ? " and your own take" : ""
      } (${Math.round(ratio * 100)}%).`,
    });
  }

  // 3. Margin slipping - the quiet way a business gets into trouble.
  const withMargin = full.filter((m) => m.grossMarginPct !== null && m.totalRevenue > 0);
  if (withMargin.length >= 4) {
    const latest = withMargin[withMargin.length - 1].grossMarginPct as number;
    const prev = withMargin.slice(-4, -1).map((m) => m.grossMarginPct as number);
    const prevAvg = prev.reduce((s, v) => s + v, 0) / prev.length;
    const drop = prevAvg - latest;
    const level: WarningLevel = drop >= 6 ? "act" : drop >= 3 ? "watch" : "ok";
    if (level !== "ok") {
      out.push({
        id: "margin_slip",
        level,
        title: "Profit margin is slipping",
        detail: `Gross margin was ${latest.toFixed(1)}% last month vs ${prevAvg.toFixed(1)}% on average over the 3 months before. Check supplier prices, discounts and what you are charging.`,
      });
    }
  }

  // 4. Slow collections.
  const total = input.receivables.totalOutstanding;
  if (total > 0) {
    const b = input.receivables.byBucket;
    const late = (b["31-60"] ?? 0) + (b["61-90"] ?? 0) + (b["90+"] ?? 0);
    const share = late / total;
    const level: WarningLevel = share >= 0.4 ? "act" : share >= 0.25 ? "watch" : "ok";
    if (level !== "ok") {
      out.push({
        id: "slow_collections",
        level,
        title: "Customers are paying late",
        detail: `${money(late)} (${Math.round(share * 100)}% of the ${money(total)} owed to you) is more than 30 days overdue. Chasing it is the fastest way to add cash.`,
      });
    }
  }

  // 4b. Borrowers late paying back money the business lent out. Stricter than customer receivables: this is
  // cash the owner chose to put at risk, and late interest keeps building on it.
  const lend = input.lending;
  if (lend && lend.owedTotal > 0.5 && lend.overdueAmount > 0.5) {
    const share = lend.overdueAmount / lend.owedTotal;
    const level: WarningLevel = share >= 0.25 ? "act" : share >= 0.05 ? "watch" : "ok";
    if (level !== "ok") {
      out.push({
        id: "borrowers_late",
        level,
        title: lend.overdueCount === 1 ? "A borrower is late paying you" : `${lend.overdueCount} borrowers are late paying you`,
        detail: `${money(lend.overdueAmount)} (${Math.round(share * 100)}% of the ${money(lend.owedTotal)} owed to you) is overdue. Contact them; if you decide it will never come, write it off so your profit tells the truth.`,
      });
    }
  }

  // 4c. Cash sitting in stock that has stopped selling.
  const st = input.stock;
  if (st && st.totalValue > 0 && st.slowValue > 0) {
    const share = st.slowValue / st.totalValue;
    const level: WarningLevel = share >= 0.5 ? "act" : share >= 0.25 ? "watch" : "ok";
    if (level !== "ok") {
      out.push({
        id: "stock_stuck",
        level,
        title: "Cash is stuck in stock that isn't selling",
        detail: `${money(st.slowValue)} (${Math.round(share * 100)}% of your ${money(st.totalValue)} of stock) has not sold for 90+ days. Consider a discount or bundle, and hold off reordering those items.`,
      });
    }
  }

  // 5. Losing money for several months running.
  const lastThree = full.slice(-3);
  if (lastThree.length === 3) {
    const losing = lastThree.filter((m) => m.netProfitPreTax < 0).length;
    const level: WarningLevel = losing === 3 ? "act" : losing === 2 ? "watch" : "ok";
    if (level !== "ok") {
      out.push({
        id: "losing_money",
        level,
        title: losing === 3 ? "Losing money three months running" : "Lost money in 2 of the last 3 months",
        detail: `Pre-tax result of the last three full months: ${lastThree.map((m) => money(m.netProfitPreTax)).join(", ")}.`,
      });
    }
  }

  const rank: Record<WarningLevel, number> = { act: 0, watch: 1, ok: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

// ---------------------------------------------------------------------------
// Rough value of the business. Ownership is a claim on what the business earns, so the honest
// first question is "what does it earn in a year". Small owner-run businesses commonly sell for a
// low multiple of yearly profit (2-4x is a widely quoted band); the balance sheet's net assets
// are shown separately as the floor. This is a conversation starter, NOT a valuation: it ignores
// growth, risk, the owner's own time, goodwill and the market. Returns null with under 6 full
// months of history, and a value of 0 for the earnings-based range when the business is not
// profitable, so it can never overstate.
// ---------------------------------------------------------------------------

export interface ValueEstimate {
  monthsUsed: number;
  annualEarnings: number; // trailing profit before tax, annualised when under 12 months
  low: number;
  high: number;
  netAssets: number;
  profitable: boolean;
}

export const VALUE_MULTIPLE_LOW = 2;
export const VALUE_MULTIPLE_HIGH = 4;

export function computeValueEstimate(
  monthlyPnL: { month: string; netProfitPreTax: number }[],
  netAssets: number,
  asOf: string
): ValueEstimate | null {
  const full = completedMonths(monthlyPnL, asOf).slice(-12);
  if (full.length < 6) return null;
  const sum = full.reduce((s, m) => s + m.netProfitPreTax, 0);
  const annualEarnings = (sum / full.length) * 12;
  const profitable = annualEarnings > 0;
  return {
    monthsUsed: full.length,
    annualEarnings,
    low: profitable ? annualEarnings * VALUE_MULTIPLE_LOW : 0,
    high: profitable ? annualEarnings * VALUE_MULTIPLE_HIGH : 0,
    netAssets,
    profitable,
  };
}
