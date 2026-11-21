// Investor pools: outside investors put money into one specific investment (a crowdfunded piece of land to
// resell, a rental property) and are paid back, and paid dividends, in proportion to what each put in.
//
// Deliberately NOT a new ledger. An investor's money is a normal CapitalEntry ("investment") and a payout is a
// normal CapitalEntry ("withdrawal"), each tagged with the investment (`securityId`) and the person
// (`investorName`). So the cash flow and balance sheet already treat them as equity coming in and going out, and
// nothing in the core statements had to change. This file only reads those tagged entries and works out who owns
// what share, what each stake is worth, and how a payout splits. Nothing is paid automatically: the person
// reviews the split and saves it. No bank, registry or tax-authority connection.
import type { CapitalEntry, InvestmentTxn } from "./types";

// A pool entry is money tied to an investment AND a named person. Anything else is the owner's own capital.
export function isPoolEntry(c: Pick<CapitalEntry, "securityId" | "investorName">): boolean {
  return !!c.securityId && !!(c.investorName ?? "").trim();
}

export function cleanInvestorName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

// "Nimal  Perera" and "nimal perera" are the same person.
export function investorKey(name: string): string {
  return cleanInvestorName(name).toLowerCase();
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Split an amount across weights so the parts add up to EXACTLY the amount, to the cent. Plain rounding can leave
// a cent over or short (three equal investors and 100.00 gives 33.33 x 3 = 99.99); the leftover cents go to the
// largest remainders, so nobody is ever paid more than a cent from their exact share.
export function splitProRata(amount: number, weights: number[]): number[] {
  const cents = Math.round(amount * 100);
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const total = w.reduce((s, x) => s + x, 0);
  if (!(cents > 0) || !(total > 0)) return w.map(() => 0);
  const raw = w.map((x) => (cents * x) / total);
  const parts = raw.map(Math.floor);
  const left = cents - parts.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < left; k++) parts[order[k % order.length].i] += 1;
  return parts.map((c) => c / 100);
}

export interface PoolInvestor {
  key: string;
  name: string;
  contributed: number;
  ownershipPct: number; // of everything put in; not changed by money paid back, so a capital return never shifts the shares
  profitReceived: number;
  capitalReturned: number;
  stakeValue: number; // ownership % of what the pool is worth now (the investment at today's value plus pool cash)
  totalReturn: number; // stake value + everything received - everything put in
  totalReturnPct: number | null;
}

export interface InvestorPool {
  securityId: string;
  investors: PoolInvestor[];
  totalContributed: number;
  capitalReturned: number;
  profitPaid: number;
  totalDistributed: number;
  capitalOutstanding: number; // put in, not yet paid back
  marketValue: number; // the investment at the value the owner last typed in (cost if never priced)
  poolCash: number; // money raised + sale proceeds + income - what was spent buying - what was paid out. Negative = the business covered the gap
  poolValue: number; // marketValue + poolCash
  poolProfit: number; // poolValue + paid out - put in
  suggestedProfit: number; // realised gains + income not yet paid out, never more than the pool's cash
}

export interface PoolPositionInput {
  marketValue: number;
  realizedGain: number;
  income: number;
}

// Cash the investment itself has moved, from its own entries. Same fee rules as lib/investments.ts: fees add to
// a buy's cost and come off a sale's or an income's proceeds.
function investmentCash(txns: InvestmentTxn[], securityId: string): number {
  let cash = 0;
  for (const t of txns) {
    if (t.securityId !== securityId) continue;
    const fees = t.fees ?? 0;
    if (t.kind === "buy") cash -= t.amount + fees;
    else cash += t.amount - fees;
  }
  return cash;
}

export function computeInvestorPool(
  securityId: string,
  capitalEntries: CapitalEntry[],
  txns: InvestmentTxn[],
  position: PoolPositionInput | null | undefined
): InvestorPool {
  type Acc = { name: string; contributed: number; profit: number; capital: number };
  const byInvestor = new Map<string, Acc>();
  for (const c of capitalEntries) {
    if (c.securityId !== securityId || !isPoolEntry(c)) continue;
    const key = investorKey(c.investorName!);
    const acc = byInvestor.get(key) ?? { name: cleanInvestorName(c.investorName!), contributed: 0, profit: 0, capital: 0 };
    if (c.kind === "withdrawal") {
      if (c.distribution === "capital") acc.capital += c.amount;
      else acc.profit += c.amount;
    } else {
      acc.contributed += c.amount;
    }
    byInvestor.set(key, acc);
  }

  const accs = [...byInvestor.entries()];
  const totalContributed = accs.reduce((s, [, a]) => s + a.contributed, 0);
  const capitalReturned = accs.reduce((s, [, a]) => s + a.capital, 0);
  const profitPaid = accs.reduce((s, [, a]) => s + a.profit, 0);
  const totalDistributed = capitalReturned + profitPaid;

  const marketValue = Math.max(0, position?.marketValue ?? 0);
  const poolCash = totalContributed + investmentCash(txns, securityId) - totalDistributed;
  const poolValue = marketValue + poolCash;
  const poolProfit = poolValue + totalDistributed - totalContributed;
  const realisedEarnings = (position?.realizedGain ?? 0) + (position?.income ?? 0);
  const suggestedProfit = r2(Math.max(0, Math.min(realisedEarnings - profitPaid, poolCash)));

  const investors: PoolInvestor[] = accs
    .map(([key, a]) => {
      const ownershipPct = totalContributed > 0 ? (a.contributed / totalContributed) * 100 : 0;
      const stakeValue = (ownershipPct / 100) * poolValue;
      const received = a.profit + a.capital;
      const totalReturn = stakeValue + received - a.contributed;
      return {
        key,
        name: a.name,
        contributed: r2(a.contributed),
        ownershipPct,
        profitReceived: r2(a.profit),
        capitalReturned: r2(a.capital),
        stakeValue: r2(stakeValue),
        totalReturn: r2(totalReturn),
        totalReturnPct: a.contributed > 0 ? (totalReturn / a.contributed) * 100 : null,
      };
    })
    .sort((a, b) => b.contributed - a.contributed || a.name.localeCompare(b.name));

  return {
    securityId,
    investors,
    totalContributed: r2(totalContributed),
    capitalReturned: r2(capitalReturned),
    profitPaid: r2(profitPaid),
    totalDistributed: r2(totalDistributed),
    capitalOutstanding: r2(totalContributed - capitalReturned),
    marketValue: r2(marketValue),
    poolCash: r2(poolCash),
    poolValue: r2(poolValue),
    poolProfit: r2(poolProfit),
    suggestedProfit,
  };
}

export type PayoutType = "profit" | "capital";

export interface PayoutPlan {
  rows: { investorName: string; amount: number; ownershipPct: number }[];
  total: number;
  errors: string[]; // stop: can't save
  warnings: string[]; // ask the person to confirm
}

// Preview of one payout: who gets what. A profit dividend splits by ownership %. A return of capital splits by
// each person's capital still outstanding, so someone already paid back in full isn't paid twice. Pure; saving it
// is the caller's job, and only after the person has seen these numbers.
export function planPayout(pool: InvestorPool, type: PayoutType, amount: number): PayoutPlan {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (pool.investors.length === 0) errors.push("No investors in this pool yet.");
  if (!(amount > 0)) errors.push("Enter an amount above zero.");
  if (errors.length) return { rows: [], total: 0, errors, warnings };

  const outstanding = pool.investors.map((i) => Math.max(0, i.contributed - i.capitalReturned));
  const weights = type === "capital" ? outstanding : pool.investors.map((i) => i.contributed);
  if (type === "capital" && outstanding.every((x) => x <= 0)) {
    return { rows: [], total: 0, errors: ["Everyone has already been paid back their capital."], warnings };
  }
  const amounts = splitProRata(amount, weights);
  const rows = pool.investors
    .map((i, idx) => ({ investorName: i.name, amount: amounts[idx], ownershipPct: i.ownershipPct }))
    .filter((r) => r.amount > 0);
  const total = r2(rows.reduce((s, r) => s + r.amount, 0));

  if (amount > pool.poolCash + 0.005) {
    warnings.push(
      pool.poolCash > 0
        ? `This pool only holds ${r2(pool.poolCash).toLocaleString()} in cash. The rest would come out of the business's own money. Record the sale or income first if it hasn't been entered yet.`
        : "This pool holds no cash right now, so this would come out of the business's own money. Record the sale or income first if it hasn't been entered yet."
    );
  }
  if (type === "capital" && amount > pool.capitalOutstanding + 0.005) {
    warnings.push(`That is more than the capital still owed back (${r2(pool.capitalOutstanding).toLocaleString()}).`);
  }
  return { rows, total, errors, warnings };
}
