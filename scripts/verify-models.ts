// Checks for the financial models and the new ratios (pass 314). Run: tsx scripts/verify-models.ts
import { altmanZPrivate } from "../lib/altman";
import { runForwardModel, type ForwardOpening, type ForwardAssumptions } from "../lib/forward-model";
import { runDivestiture } from "../lib/divestiture";
import { runMergerAccretion } from "../lib/accretion";
import { refPayablesTurnover, refCapitalGearing, refFixedChargeCover } from "../lib/ratios-reference";
import { rentExpenseFor } from "../lib/fixed-charges";
import type { Expense } from "../lib/types";

let fails = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) { fails++; console.log("FAIL:", name); }
};
const close = (a: number | null, b: number, tol = 0.01) => a !== null && Math.abs(a - b) <= tol;

// Altman Z'' (private, non-manufacturer)
const safe = altmanZPrivate({ workingCapital: 100, retainedEarnings: 200, ebit: 150, bookEquity: 400, totalAssets: 1000, totalLiabilities: 600 });
check("altman: healthy firm is safe", safe !== null && safe.zone === "safe" && close(safe.z, 3.02, 0.02));
const grey = altmanZPrivate({ workingCapital: 50, retainedEarnings: 100, ebit: 60, bookEquity: 300, totalAssets: 1000, totalLiabilities: 700 });
check("altman: middling firm is grey", grey !== null && grey.zone === "grey" && close(grey.z, 1.51, 0.02));
const distress = altmanZPrivate({ workingCapital: -300, retainedEarnings: -500, ebit: -200, bookEquity: 50, totalAssets: 1000, totalLiabilities: 950 });
check("altman: loss-making firm is distress", distress !== null && distress.zone === "distress" && distress.z < 1.1);
check("altman: no liabilities gives null", altmanZPrivate({ workingCapital: 1, retainedEarnings: 1, ebit: 1, bookEquity: 1, totalAssets: 10, totalLiabilities: 0 }) === null);

// Projection
const zero: ForwardOpening = { cash: 0, receivables: 0, inventory: 0, fixedAssets: 0, payables: 0, loans: 0, equity: 0 };
const plain: ForwardAssumptions = {
  startMonthlyRevenue: 1000, monthlyGrowthPct: 0, grossMarginPct: 50, monthlyOpex: 100, depreciationPctYear: 0,
  capexMonthly: 0, loanRepaymentMonthly: 0, interestPctYear: 0, taxRatePct: 0, receivableDays: 30,
  inventoryDays: 0, payableDays: 0, dividendPayoutPct: 0,
};
const p1 = runForwardModel(zero, plain, 12);
check("projection: plain case has no error", p1.error === "");
check("projection: month 1 profit is 400", p1.months[0].netProfit === 400);
check("projection: month 1 cash is -600 (all sales on credit)", p1.months[0].cash === -600);
check("projection: plain case balances every month", p1.balanced);
check("projection: 12 months of profit is 4800", p1.totalNetProfit === 4800);
check("projection: end cash is 3800 (profit less the 1000 owed)", p1.endCash === 3800);
const opened: ForwardOpening = { cash: 500, receivables: 300, inventory: 200, fixedAssets: 1000, payables: 150, loans: 400, equity: 1450 };
const busy: ForwardAssumptions = {
  startMonthlyRevenue: 800, monthlyGrowthPct: 2, grossMarginPct: 40, monthlyOpex: 200, depreciationPctYear: 12,
  capexMonthly: 50, loanRepaymentMonthly: 30, interestPctYear: 9, taxRatePct: 25, receivableDays: 45,
  inventoryDays: 30, payableDays: 20, dividendPayoutPct: 20,
};
const p2 = runForwardModel(opened, busy, 12);
check("projection: full case has no error", p2.error === "");
check("projection: full case balances every month", p2.balanced && p2.months.every((m) => Math.abs(m.balanceGap) < 0.01));
check("projection: full case has 12 months", p2.months.length === 12);
const bad = runForwardModel({ ...opened, cash: 999 }, busy, 12);
check("projection: unbalanced opening is refused", bad.error.includes("does not balance"));
check("projection: zero months is refused", runForwardModel(opened, busy, 0).error !== "");
check("projection: tax over 100 is refused", runForwardModel(opened, { ...busy, taxRatePct: 150 }, 12).error !== "");
check("projection: 25 months is refused", runForwardModel(opened, busy, 25).error !== "");

// Divestiture
const dv = runDivestiture({ salePrice: 1000, costsOfSale: 50, netBookValueSold: 600, taxRatePct: 20, unitAnnualProfitAfterTax: 80, proceedsToRepayDebt: 300, loanRatePct: 12, cashRatePct: 4 });
check("divest: gain is 350", dv.gainOrLoss === 350);
check("divest: tax on gain is 70", dv.taxOnGain === 70);
check("divest: cash kept is 580", dv.cashKept === 580);
check("divest: annual profit change is -32.64", close(dv.annualProfitChange, -32.64));
check("divest: implied multiple is 12.5", dv.impliedMultiple !== null && close(dv.impliedMultiple, 12.5));
check("divest: debt above net proceeds is refused", runDivestiture({ salePrice: 100, costsOfSale: 0, netBookValueSold: 0, taxRatePct: 0, unitAnnualProfitAfterTax: 0, proceedsToRepayDebt: 500, loanRatePct: 0, cashRatePct: 0 }).error !== "");
const loss = runDivestiture({ salePrice: 300, costsOfSale: 0, netBookValueSold: 500, taxRatePct: 20, unitAnnualProfitAfterTax: 0, proceedsToRepayDebt: 0, loanRatePct: 0, cashRatePct: 0 });
check("divest: a loss on sale gives no tax", loss.taxOnGain === 0 && loss.oneOffProfitEffect === -200);

// Accretion
const mgIn = { acquirerNetProfit: 1000, acquirerShares: 500, acquirerSharePrice: 40, targetNetProfit: 200, purchasePrice: 1600, cashPct: 50, cashRatePct: 5, taxRatePct: 20, afterTaxSynergies: 0 };
const mg = runMergerAccretion(mgIn);
check("accretion: standalone EPS is 2", mg.standaloneEps !== null && close(mg.standaloneEps, 2));
check("accretion: 20 new shares", close(mg.newShares, 20));
check("accretion: about 12.3% accretive", mg.verdict === "accretive" && mg.accretionPct !== null && close(mg.accretionPct, 12.31, 0.05));
const dil = runMergerAccretion({ acquirerNetProfit: 1000, acquirerShares: 500, acquirerSharePrice: 10, targetNetProfit: 50, purchasePrice: 4000, cashPct: 0, cashRatePct: 0, taxRatePct: 0, afterTaxSynergies: 0 });
check("accretion: an overpriced share deal is dilutive", dil.verdict === "dilutive");
check("accretion: zero shares refused", runMergerAccretion({ ...mgIn, acquirerShares: 0 }).error === "Your number of shares must be above zero.");
check("accretion: share deal needs a share price", runMergerAccretion({ ...mgIn, acquirerSharePrice: 0 }).error === "Your share price must be above zero to issue shares.");

// Ratios
check("payables turnover 1200/300 = 4", refPayablesTurnover(1200, 300) === 4);
check("capital gearing 600/400 = 1.5", refCapitalGearing(600, 400) === 1.5);
check("capital gearing with no borrowings is null", refCapitalGearing(600, 0) === null);
check("fixed charge cover (100+50)/(50+50) = 1.5", refFixedChargeCover(100, 50, 50) === 1.5);
check("fixed charge cover with no EBIT is null", refFixedChargeCover(null, 50, 50) === null);

// Rent helper: a monthly rent line counts once per month it runs
const rent = { id: "r", name: "Office", amount: 100, category: "Rent", kind: "expense", isRecurring: true, recurrence: "monthly", startDate: "2026-01-01" } as unknown as Expense;
const other = { id: "o", name: "Stationery", amount: 40, category: "Office", kind: "expense", isRecurring: false, recurrence: "monthly", startDate: "2026-03-05" } as unknown as Expense;
check("rent: monthly rent counts for each month", rentExpenseFor([rent, other], ["2026-03", "2026-04"]) === 200);
check("rent: other categories are not counted", rentExpenseFor([other], ["2026-03"]) === 0);

console.log(fails === 0 ? "models and new ratios: all checks passed" : `models and new ratios: ${fails} check(s) failed`);
if (fails > 0) process.exit(1);
