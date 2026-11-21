// Dividends to the people on the cap table (v289, tax withholding v290). A company dividend is split between them in proportion
// to their shares, recorded per person, and checked against the profit not yet paid out. Pool dividends (lib/investorPool.ts) are
// a different thing: they belong to one investment. This module is a record and a split. It never pays anyone.
// Tax (v290): the owner enters the withholding rate for a dividend, and it is applied exactly as entered. Balancr does not know
// which rate applies to which person or what your country's rules are; the check against profit uses accounting profit only.
// The company pays out the gross amount: the withheld part goes to the tax authority and the rest to the person.
// Pure: no I/O. Money is handled in whole cents so the allocations add up exactly to the dividend.
import type { CapitalEntry, EquityHolder, EquityRound, ShareholderDividend } from "./types";
import { investorKey, splitProRata } from "./investorPool";

const r2 = (n: number) => Math.round(n * 100) / 100;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_WITHHOLDING_PCT = 100;

export interface DividendAllocation { holderId: string; name: string; shares: number; amount: number }
export interface TaxedAllocation extends DividendAllocation { withheld: number; net: number }

// The split of one dividend by shares. People with no shares get nothing. Leftover cents go to the largest remainders.
export function dividendAllocations(amount: number, holders: EquityHolder[]): DividendAllocation[] {
  const eligible = holders.filter((h) => Number.isFinite(h.shares) && h.shares > 0);
  const parts = splitProRata(amount, eligible.map((h) => h.shares));
  return eligible.map((h, i) => ({ holderId: h.id, name: h.name, shares: h.shares, amount: parts[i] }));
}

// A withholding rate: 15 means 15%. Null or undefined means none is recorded (treated as 0). At most 2 decimals.
export function validateWithholding(pct: number | null | undefined): string | null {
  if (pct === null || pct === undefined) return null;
  if (!Number.isFinite(pct) || pct < 0 || pct > MAX_WITHHOLDING_PCT) return `Enter the tax withheld as a percentage from 0 to ${MAX_WITHHOLDING_PCT}.`;
  if (Math.abs(pct * 100 - Math.round(pct * 100)) > 1e-9) return "Enter the tax withheld with at most 2 decimals.";
  return null;
}

// Each person's tax withheld and net amount, in whole cents: withheld + net = the amount allocated to them, exactly.
export function withholdingSplit(allocations: DividendAllocation[], pct: number): TaxedAllocation[] {
  const hundredths = Math.round((Number.isFinite(pct) ? pct : 0) * 100); // 15% = 1500
  return allocations.map((a) => {
    const cents = Math.round(a.amount * 100);
    const withheldCents = Math.round((cents * hundredths) / 10000);
    return { ...a, withheld: withheldCents / 100, net: (cents - withheldCents) / 100 };
  });
}

// Tax withheld across all dividends, from the stored splits (dividends recorded before v290 have none, so count as 0).
export function taxWithheldTotal(dividends: ShareholderDividend[]): number {
  return r2(dividends.reduce((s, d) => s + d.allocations.reduce((t, a) => t + (a.withheld ?? 0), 0), 0));
}

// Profit already paid to people: pool dividends (withdrawals marked as profit), plus shareholder dividends declared.
// Returns of an investor's own capital and the owner's own drawings are not profit paid out, so they are not counted here.
export function profitPaidOut(
  capitalEntries: Pick<CapitalEntry, "kind" | "amount" | "distribution">[],
  dividends: Pick<ShareholderDividend, "amount">[]
): number {
  const pool = capitalEntries.reduce((s, c) => s + (c.kind === "withdrawal" && c.distribution === "profit" ? c.amount : 0), 0);
  return r2(pool + dividends.reduce((s, d) => s + d.amount, 0));
}

// Profit that can still be paid out: profit after tax since the books began, less what has been paid out already.
export function distributableProfit(cumulativeProfitAfterTax: number, paidOut: number): number {
  const profit = Number.isFinite(cumulativeProfitAfterTax) ? cumulativeProfitAfterTax : 0;
  return r2(profit - paidOut);
}

// Problems with a dividend about to be declared. Empty = it can be declared.
export function validateDividend(input: { amount: number; date: string; holders: EquityHolder[]; distributable: number; withholdingPct?: number | null }): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(input.amount) || !(input.amount > 0)) errors.push("Enter how much the dividend is, above zero.");
  if (!DATE.test(input.date)) errors.push("Enter the date the dividend is paid.");
  if (!input.holders.some((h) => h.shares > 0)) errors.push("Add the shareholders and their shares first.");
  const taxProblem = validateWithholding(input.withholdingPct);
  if (taxProblem) errors.push(taxProblem);
  if (Number.isFinite(input.amount) && input.amount > 0) {
    if (input.distributable <= 0) errors.push(`There is no profit left to pay out (${input.distributable.toFixed(2)}). Dividends come out of profit.`);
    else if (input.amount > input.distributable) errors.push(`This is more than the profit not yet paid out (${input.distributable.toFixed(2)}). Dividends come out of profit.`);
  }
  return errors;
}

export interface HolderRow {
  holderId: string;
  name: string;
  current: boolean; // false = no longer on the cap table, but still owed a record of dividends received
  shares: number;
  pct: number;
  invested: number; // money put in through equity rounds, matched by name
  received: number; // dividends paid to the person before tax
  withheld: number; // tax withheld from those dividends
  netReceived: number; // what the person actually received: received less withheld
  dividendCount: number;
  lastDate: string | null;
  returnPct: number | null; // net dividends received as a % of money put in; null when nothing was put in
}

// A statement for each person: what they own, what they put in, and what they have been paid. Built from the stored splits.
export function holderStatements(holders: EquityHolder[], rounds: EquityRound[] = [], dividends: ShareholderDividend[] = []): HolderRow[] {
  const total = holders.reduce((s, h) => s + (h.shares > 0 ? h.shares : 0), 0);
  const rowFor = (id: string, name: string, current: boolean, shares: number): HolderRow => {
    const key = investorKey(name);
    const invested = r2(rounds.reduce((s, r) => s + (investorKey(r.investor) === key ? r.amount : 0), 0));
    let received = 0;
    let withheld = 0;
    let count = 0;
    let last: string | null = null;
    for (const d of dividends) {
      const a = d.allocations.find((x) => x.holderId === id);
      if (!a) continue;
      received += a.amount;
      withheld += a.withheld ?? 0;
      count++;
      if (!last || d.date > last) last = d.date;
    }
    const r = r2(received);
    const w = r2(withheld);
    const net = r2(r - w);
    return {
      holderId: id,
      name,
      current,
      shares,
      pct: total > 0 && shares > 0 ? r2((shares / total) * 100) : 0,
      invested,
      received: r,
      withheld: w,
      netReceived: net,
      dividendCount: count,
      lastDate: last,
      returnPct: invested > 0 ? r2((net / invested) * 100) : null,
    };
  };
  const rows = holders.map((h) => rowFor(h.id, h.name.replace(/\s+/g, " ").trim(), true, h.shares));
  // A person paid earlier but removed from the cap table keeps a row, so their dividends are never lost from the record.
  const seen = new Set(holders.map((h) => h.id));
  const gone = new Map<string, string>();
  for (const d of dividends) for (const a of d.allocations) if (!seen.has(a.holderId) && !gone.has(a.holderId)) gone.set(a.holderId, a.name);
  for (const [id, name] of gone) rows.push(rowFor(id, name, false, 0));
  return rows;
}

// One line per person per dividend, oldest first, for the statement export.
export function dividendLedgerRows(dividends: ShareholderDividend[]) {
  return [...dividends]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .flatMap((d) => d.allocations.map((a) => ({
      date: d.date,
      note: d.note ?? "",
      dividend_total: d.amount,
      withholding_pct: d.withholdingPct ?? 0,
      holder: a.name,
      shares: a.shares,
      paid_to_holder: a.amount,
      tax_withheld: a.withheld ?? 0,
      net_paid_to_holder: a.net ?? a.amount,
    })));
}

export function holderStatementRows(rows: HolderRow[]) {
  return rows.map((r) => ({
    holder: r.name,
    on_cap_table: r.current ? "yes" : "no",
    shares: r.shares,
    ownership_pct: r.pct,
    money_put_in: r.invested,
    dividends_received: r.received,
    tax_withheld: r.withheld,
    net_received: r.netReceived,
    dividend_count: r.dividendCount,
    last_dividend: r.lastDate ?? "",
    received_pct_of_money_in: r.returnPct ?? "",
  }));
}
