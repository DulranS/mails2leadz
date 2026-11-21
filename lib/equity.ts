// Selling a share of the business: who owns what, what a raise does to everyone's percentage (dilution), what the
// price and valuation imply, and whether a use-of-funds plan adds up. Pure planning maths on top of a small
// shareholder list the owner keeps. It is a working record, not a legal share register: nothing here is filed with
// or checked against a registry, regulator, exchange or tax authority, and it never moves money.
import { investorKey } from "./investorPool";
import type { EquityHolder, UseOfFundsLine } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface CapRow { id: string; name: string; shares: number; pct: number }
export interface CapTable { totalShares: number; rows: CapRow[] }

export function computeCapTable(holders: EquityHolder[]): CapTable {
  const total = holders.reduce((s, h) => s + (h.shares > 0 ? h.shares : 0), 0);
  return {
    totalShares: total,
    rows: holders.map((h) => ({ id: h.id, name: h.name, shares: h.shares, pct: total > 0 && h.shares > 0 ? (h.shares / total) * 100 : 0 })),
  };
}

// Problems with a shareholder list the owner is about to save: empty names, shares that aren't whole positive
// numbers, or the same person twice.
export function validateHolders(holders: EquityHolder[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  holders.forEach((h, i) => {
    const label = h.name.trim() || `Row ${i + 1}`;
    if (!h.name.trim()) errors.push(`Row ${i + 1} has no name.`);
    if (!Number.isInteger(h.shares) || h.shares <= 0) errors.push(`${label}: shares must be a whole number above zero.`);
    const key = investorKey(h.name);
    if (key && seen.has(key)) errors.push(`${label} appears twice. Combine them into one row.`);
    if (key) seen.add(key);
  });
  return errors;
}

export interface RaiseRow {
  id: string | null; // null = a brand-new shareholder
  name: string;
  isNew: boolean;
  sharesBefore: number;
  sharesAfter: number;
  pctBefore: number;
  pctAfter: number;
  dilutionPts: number; // percentage points given up (0 for the investor, who only gains)
}

export interface RaisePlan {
  errors: string[];
  warnings: string[];
  pricePerShare: number; // preMoney / shares in issue today
  newShares: number; // whole shares the money buys at that price
  effectivePrice: number; // money / new shares: differs a little from the price when rounded to whole shares
  postMoney: number; // preMoney + money raised
  investorPct: number; // what the investor holds afterwards (including anything they held before)
  rows: RaiseRow[];
  holdersAfter: EquityHolder[];
}

const EMPTY_PLAN: RaisePlan = { errors: [], warnings: [], pricePerShare: 0, newShares: 0, effectivePrice: 0, postMoney: 0, investorPct: 0, rows: [], holdersAfter: [] };

// What happens to ownership if `investorName` puts in `amount` when the business is valued at `preMoney` before
// that money. Price per share = preMoney / shares in issue; the money buys amount / price new shares, rounded to
// whole shares. If the investor already holds shares, the new ones are added to theirs.
export function planRaise(holders: EquityHolder[], preMoney: number, amount: number, investorName: string): RaisePlan {
  const errors: string[] = [];
  const name = investorName.replace(/\s+/g, " ").trim();
  const before = computeCapTable(holders);
  if (holders.length === 0 || before.totalShares <= 0) errors.push("Add the current shareholders first (at least yourself), then plan the raise.");
  if (!(preMoney > 0)) errors.push("Enter what you think the business is worth before the new money.");
  if (!(amount > 0)) errors.push("Enter how much money you want to raise.");
  if (!name) errors.push("Enter the investor's name.");
  if (errors.length) return { ...EMPTY_PLAN, errors };

  const pricePerShare = preMoney / before.totalShares;
  const newShares = Math.round(amount / pricePerShare);
  if (newShares < 1) {
    return { ...EMPTY_PLAN, pricePerShare, errors: [`That is less than the price of one share (${r2(pricePerShare).toLocaleString()}). Raise more, or split the existing shares into more of them.`] };
  }

  const key = investorKey(name);
  const existing = holders.find((h) => investorKey(h.name) === key);
  const holdersAfter: EquityHolder[] = existing
    ? holders.map((h) => (h.id === existing.id ? { ...h, shares: h.shares + newShares } : h))
    : [...holders, { id: `new-${key}`, name, shares: newShares }];
  const after = computeCapTable(holdersAfter);

  const rows: RaiseRow[] = holdersAfter.map((h) => {
    const b = before.rows.find((r) => r.id === h.id);
    const a = after.rows.find((r) => r.id === h.id)!;
    const pctBefore = b?.pct ?? 0;
    return {
      id: b ? h.id : null,
      name: h.name,
      isNew: !b,
      sharesBefore: b?.shares ?? 0,
      sharesAfter: h.shares,
      pctBefore,
      pctAfter: a.pct,
      dilutionPts: Math.max(0, pctBefore - a.pct),
    };
  });
  const investorRow = rows.find((r) => investorKey(r.name) === key)!;

  const warnings: string[] = [];
  if (investorRow.pctAfter > 50) warnings.push(`${name} would own more than half of the business (${investorRow.pctAfter.toFixed(1)}%), which gives them control of decisions that need a majority.`);
  const lostMajority = rows.find((r) => r.pctBefore > 50 && r.pctAfter <= 50);
  if (lostMajority) warnings.push(`${lostMajority.name} would drop from ${lostMajority.pctBefore.toFixed(1)}% to ${lostMajority.pctAfter.toFixed(1)}% and no longer hold a majority on their own.`);

  return {
    errors: [],
    warnings,
    pricePerShare,
    newShares,
    effectivePrice: amount / newShares,
    postMoney: preMoney + amount,
    investorPct: investorRow.pctAfter,
    rows,
    holdersAfter,
  };
}

export interface LadderStep { givePct: number; amount: number; postMoney: number }

// "What does giving away X% bring in?" at a given valuation: amount = preMoney x p / (100 - p). The trade-off
// between how much money you need and how much of the business you part with, on one screen.
export function dilutionLadder(preMoney: number, percents: number[] = [5, 10, 15, 20, 25, 30]): LadderStep[] {
  if (!(preMoney > 0)) return [];
  return percents
    .filter((p) => p > 0 && p < 100)
    .map((p) => {
      const amount = (preMoney * p) / (100 - p);
      return { givePct: p, amount: r2(amount), postMoney: r2(preMoney + amount) };
    });
}

export interface ImpliedMultiples {
  salesMultiple: number | null; // valuation / sales over the last 12 months
  profitMultiple: number | null; // valuation / profit after tax over the last 12 months (null when not profitable)
  bookMultiple: number | null; // valuation / what the balance sheet says the business is worth (null when that isn't positive)
}

// A reality check on the valuation using the business's OWN numbers, not market data: an investor will compare
// these with what similar businesses sell for. Not a valuation.
export function impliedMultiples(valuation: number, sales12m: number, profit12m: number, bookEquity: number): ImpliedMultiples {
  const ok = valuation > 0;
  return {
    salesMultiple: ok && sales12m > 0 ? valuation / sales12m : null,
    profitMultiple: ok && profit12m > 0 ? valuation / profit12m : null,
    bookMultiple: ok && bookEquity > 0 ? valuation / bookEquity : null,
  };
}

export interface FundsPlanSummary {
  planned: number;
  remaining: number; // raise amount - planned (negative = planned more than is being raised)
  status: "empty" | "short" | "exact" | "over";
}

// Does the use-of-funds plan add up to the money being raised? Investors ask where the money goes.
export function summarizeUseOfFunds(lines: UseOfFundsLine[], raiseAmount: number): FundsPlanSummary {
  const planned = r2(lines.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0));
  const remaining = r2((raiseAmount > 0 ? raiseAmount : 0) - planned);
  const status = lines.length === 0 ? "empty" : Math.abs(remaining) < 0.005 ? "exact" : remaining > 0 ? "short" : "over";
  return { planned, remaining, status };
}
