// Accretion / dilution model (pass 314). Pure: no I/O. Buy another business, paid partly in cash and partly in your own shares.
// Pro forma profit = your profit + the target's profit + after-tax synergies - interest forgone on the cash used. New shares =
// the share part of the price over your share price. The verdict compares pro forma earnings per share with today's.

export interface MergerInput {
  acquirerNetProfit: number;
  acquirerShares: number;
  acquirerSharePrice: number; // used to price new shares issued
  targetNetProfit: number;
  purchasePrice: number;
  cashPct: number; // share of the price paid in cash, 0 to 100
  cashRatePct: number; // what the cash would have earned
  taxRatePct: number;
  afterTaxSynergies: number;
}

export interface MergerResult {
  error: string;
  standaloneEps: number | null;
  proFormaEps: number | null;
  newShares: number;
  cashUsed: number;
  interestForgone: number;
  proFormaNetProfit: number;
  accretionPct: number | null;
  verdict: "accretive" | "dilutive" | "neutral" | null;
}

export function runMergerAccretion(i: MergerInput): MergerResult {
  const fail = (error: string): MergerResult => ({
    error, standaloneEps: null, proFormaEps: null, newShares: 0, cashUsed: 0, interestForgone: 0,
    proFormaNetProfit: 0, accretionPct: null, verdict: null,
  });
  if (!Object.values(i).every((v) => Number.isFinite(v))) return fail("Every input must be a number.");
  if (i.acquirerShares <= 0) return fail("Your number of shares must be above zero.");
  if (i.purchasePrice < 0) return fail("The purchase price cannot be negative.");
  if (i.cashPct < 0 || i.cashPct > 100) return fail("The cash share must be between 0 and 100%.");
  if ([i.cashRatePct, i.taxRatePct].some((p) => p < 0 || p > 100)) return fail("Rates must be between 0 and 100%.");
  const sharePart = i.purchasePrice * (1 - i.cashPct / 100);
  if (sharePart > 0 && i.acquirerSharePrice <= 0) return fail("Your share price must be above zero to issue shares.");
  const newShares = sharePart > 0 ? sharePart / i.acquirerSharePrice : 0;
  const cashUsed = i.purchasePrice * (i.cashPct / 100);
  const interestForgone = (cashUsed * i.cashRatePct * (1 - i.taxRatePct / 100)) / 100;
  const proFormaNetProfit = i.acquirerNetProfit + i.targetNetProfit + i.afterTaxSynergies - interestForgone;
  const standaloneEps = i.acquirerNetProfit / i.acquirerShares;
  const proFormaEps = proFormaNetProfit / (i.acquirerShares + newShares);
  const diff = proFormaEps - standaloneEps;
  const verdict = Math.abs(diff) < 1e-9 ? "neutral" : diff > 0 ? "accretive" : "dilutive";
  return {
    error: "",
    standaloneEps,
    proFormaEps,
    newShares,
    cashUsed,
    interestForgone,
    proFormaNetProfit,
    accretionPct: standaloneEps > 0 ? (proFormaEps / standaloneEps - 1) * 100 : null,
    verdict,
  };
}
