// Balances for a period (v319). A balance-sheet account carries its balance forward: its opening balance is everything posted before the
// period, its closing balance is that plus the period's movement. A profit-and-loss account starts every period at zero, and its
// period figure is the movement inside the period. Profit is moved into Retained earnings by a year-end close, derived here from the
// journal (nothing is stored). The check is on the balance sheet: its closing balances must net to zero. Pure.
import type { JEntry, JLine } from "./journal";

export const PROFIT_ACCOUNTS = ["Sales revenue", "Cost of sales", "Depreciation expense", "Interest expense", "Loss on disposal", "Gain on disposal", "Unrealised investment gain"] as const;
export const RETAINED_EARNINGS = "Retained earnings";
export const isProfitAccount = (account: string) => (PROFIT_ACCOUNTS as readonly string[]).includes(account);
const r2 = (n: number) => Math.round(n * 100) / 100;

const dayBefore = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

// The year-end close for the profit-and-loss movement from `from` to `to`, dated `to`. Each profit account is cleared, and Retained earnings
// takes the total. Null when there is no profit movement to close.
export function yearEndClose(entries: JEntry[], from: string, to: string): JEntry | null {
  const net = new Map<string, number>();
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    for (const l of e.lines) if (isProfitAccount(l.account)) net.set(l.account, r2((net.get(l.account) ?? 0) + l.debit - l.credit));
  }
  const lines: JLine[] = [];
  let total = 0;
  for (const account of [...net.keys()].sort()) {
    const n = net.get(account) ?? 0;
    if (Math.abs(n) < 0.005) continue;
    lines.push(n > 0 ? { account, debit: 0, credit: n } : { account, debit: -n, credit: 0 });
    total = r2(total + n);
  }
  if (!lines.length) return null;
  lines.push(total > 0 ? { account: RETAINED_EARNINGS, debit: total, credit: 0 } : { account: RETAINED_EARNINGS, debit: 0, credit: -total });
  return { id: `close-${to}`, date: to, memo: `Year-end close, ${from} to ${to}`, lines };
}

export interface PeriodRow { account: string; kind: "balance" | "profit"; opening: number; movement: number; closing: number }

export function periodBalances(entries: JEntry[], from: string, to: string) {
  const rows = new Map<string, PeriodRow>();
  const row = (account: string) => {
    let r = rows.get(account);
    if (!r) {
      r = { account, kind: isProfitAccount(account) ? "profit" : "balance", opening: 0, movement: 0, closing: 0 };
      rows.set(account, r);
    }
    return r;
  };
  // Everything before the period is closed into Retained earnings, so balance-sheet accounts carry forward and profit starts at zero.
  const before = entries.filter((e) => e.date < from);
  const priorClose = yearEndClose(before, "0000-01-01", dayBefore(from));
  for (const e of before) for (const l of e.lines) if (!isProfitAccount(l.account)) row(l.account).opening = r2(row(l.account).opening + l.debit - l.credit);
  if (priorClose) for (const l of priorClose.lines) if (!isProfitAccount(l.account)) row(l.account).opening = r2(row(l.account).opening + l.debit - l.credit);

  const inside = entries.filter((e) => e.date >= from && e.date <= to);
  for (const e of inside) for (const l of e.lines) row(l.account).movement = r2(row(l.account).movement + l.debit - l.credit);
  // The window's own year-end close moves its profit into Retained earnings, so the closing balance sheet includes it.
  const windowClose = yearEndClose(inside, from, to);
  if (windowClose) for (const l of windowClose.lines) if (!isProfitAccount(l.account)) row(l.account).movement = r2(row(l.account).movement + l.debit - l.credit);

  const list = [...rows.values()].map((r) => {
    if (r.kind === "profit") return { ...r, opening: 0, closing: r.movement };
    return { ...r, closing: r2(r.opening + r.movement) };
  }).sort((a, b) => a.account.localeCompare(b.account));
  const balanceSheet = list.filter((r) => r.kind === "balance");
  const profit = list.filter((r) => r.kind === "profit");
  const closingNet = r2(balanceSheet.reduce((t, r) => t + r.closing, 0));
  const profitForPeriod = r2(profit.reduce((t, r) => t + r.movement, 0)); // debit minus credit: negative means a profit
  return { balanceSheet, profit, balanced: Math.abs(closingNet) < 0.005, profitForPeriod: -profitForPeriod, closeEntry: windowClose };
}

// The analyst's working-capital check (v320): how much cash the range tied up in receivables and stock, or released. Positive means cash
// was tied up (both balances rose); negative means it was released. Taken from the period's movements, so it works for any range. Pure.
export const WORKING_CAPITAL_ACCOUNTS = ["Accounts receivable", "Inventory"] as const;
export function workingCapitalTiedUp(period: { balanceSheet: PeriodRow[] }): number {
  const moved = period.balanceSheet
    .filter((r) => (WORKING_CAPITAL_ACCOUNTS as readonly string[]).includes(r.account))
    .reduce((t, r) => t + r.movement, 0);
  return r2(moved); // movement is debit minus credit: a rise in receivables or stock is a debit
}

// Where a cash movement belongs (v320). The class is the account on the other side of the entry. Balancr's journal does not keep this
// split, so it is derived here: each entry's cash movement goes to the class of its largest non-cash line. An entry with no cash line
// (an accrual, a depreciation charge) moves no cash and counts for nothing. Approximation: an entry that mixes classes (for example a
// loan repayment with interest) is put in one class as a whole, so one year's split can be off by the mixed part.
export const INVESTING_ACCOUNTS = ["Fixed assets (cost)", "Investments", "Loans lent out"] as const;
export const FINANCING_ACCOUNTS = ["Loans payable", "Owners' capital", "Retained earnings"] as const;
export function cashClass(account: string): "investing" | "financing" | "operating" {
  if ((INVESTING_ACCOUNTS as readonly string[]).includes(account)) return "investing";
  if ((FINANCING_ACCOUNTS as readonly string[]).includes(account)) return "financing";
  return "operating";
}
export function cashSplit(entries: JEntry[], from: string, to: string) {
  const out = { operating: 0, investing: 0, financing: 0, net: 0 };
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    const cash = e.lines.filter((l) => l.account === "Cash").reduce((t, l) => t + l.debit - l.credit, 0);
    if (Math.abs(cash) < 0.005) continue;
    // the class with the largest non-cash amount decides where this entry's cash goes
    const weight = new Map<string, number>();
    for (const l of e.lines) {
      if (l.account === "Cash") continue;
      const c = cashClass(l.account);
      weight.set(c, (weight.get(c) ?? 0) + Math.abs(l.debit - l.credit));
    }
    const cls = [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "operating";
    out[cls as "operating" | "investing" | "financing"] = r2(out[cls as "operating" | "investing" | "financing"] + cash);
    out.net = r2(out.net + cash);
  }
  return out;
}
// Operating cash for each of the given years (calendar years), and whether it is positive in every one. Pure.
export function operatingCashByYear(entries: JEntry[], years: number[]) {
  const rows = years.map((y) => ({ year: y, operating: cashSplit(entries, `${y}-01-01`, `${y}-12-31`).operating }));
  return { rows, positiveEveryYear: rows.length > 0 && rows.every((r) => r.operating > 0) };
}

// Profit to operating cash, indirect method, for a range (pass 349). Built from the journal's own lines, so it reconciles to the change in
// the Cash account: every entry balances, so operating + investing + financing must equal the Cash movement. The unexplained amount is
// shown, and is zero for a balanced journal.
//   Operating: profit, less gains and losses on disposals and unrealised investment gains (they are not cash), plus depreciation charged
//   (credits to accumulated depreciation), plus working capital (receivables, stock, payables, tax and accruals; their cash effect).
//   Investing: fixed asset and investment movements, with the non-cash gains and losses added back, less accumulated depreciation released
//   on disposal.
//   Financing: loans, owners' capital and dividends (debits to retained earnings).
export const DISPOSAL_ACCOUNTS = ["Gain on disposal", "Loss on disposal"] as const;
export const NON_CASH_GAIN_ACCOUNT = "Unrealised investment gain";
export const DEPRECIATION_RESERVE = "Accumulated depreciation";
const FINANCING_LINES = ["Loans payable", "Owners' capital"] as const;

export function indirectCashBridge(entries: JEntry[], from: string, to: string) {
  let profit = 0, nonCashGains = 0, depCharge = 0, accDepReleased = 0;
  let cashMove = 0, investingRaw = 0, financing = 0, workingCapital = 0;
  const wc = new Map<string, number>();
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    for (const l of e.lines) {
      const account = l.account;
      const net = l.debit - l.credit;
      if (account === "Cash") { cashMove += net; continue; }
      if (isProfitAccount(account)) {
        profit += -net;
        if (account === NON_CASH_GAIN_ACCOUNT || (DISPOSAL_ACCOUNTS as readonly string[]).includes(account)) nonCashGains += -net;
        continue;
      }
      if (account === DEPRECIATION_RESERVE) { depCharge += l.credit; accDepReleased += l.debit; continue; }
      if (account === RETAINED_EARNINGS || (FINANCING_LINES as readonly string[]).includes(account)) { financing += -net; continue; }
      if (account.startsWith("Fixed assets") || (INVESTING_ACCOUNTS as readonly string[]).includes(account)) { investingRaw += -net; continue; }
      // Everything else on the balance sheet is working capital: its cash effect is the opposite of its movement.
      wc.set(account, (wc.get(account) ?? 0) - net);
      workingCapital += -net;
    }
  }
  const operating = profit - nonCashGains + depCharge + workingCapital;
  const investing = investingRaw + nonCashGains - accDepReleased;
  const unexplained = cashMove - (operating + investing + financing);
  return {
    profit: r2(profit),
    nonCashGains: r2(nonCashGains),
    depreciation: r2(depCharge),
    workingCapital: r2(workingCapital),
    workingCapitalLines: [...wc.entries()].map(([account, cashEffect]) => ({ account, cashEffect: r2(cashEffect) })).sort((a, b) => a.account.localeCompare(b.account)),
    accumulatedDepreciationReleased: r2(accDepReleased),
    operating: r2(operating),
    investing: r2(investing),
    financing: r2(financing),
    cashMovement: r2(cashMove),
    unexplained: r2(unexplained),
    reconciles: Math.abs(unexplained) < 0.005,
  };
}
