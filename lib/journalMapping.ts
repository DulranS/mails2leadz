// The rest of the journal (v272): receivable and payable payments, stock purchases with their landed costs and input tax, the cost of goods sold, loan
// drawdowns and each monthly repayment split into interest and principal, fixed-asset purchases and monthly depreciation. Each entry is checked as it is made.
// Then the journal's balances are reconciled to the balance sheet, account by account, and any difference is shown as a difference, not hidden. Pure.
import { makeEntry, journalTotals, type JEntry, type JLine } from "./journal";
import { balanceAfter, monthlyPayment } from "./rateStress";
import { computeFixedAssetStatus } from "./calculations";
import type { FixedAsset } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
};
const addMonths = (iso: string, k: number) => {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const monthEnd = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export function mappingEntries(input: {
  asOf: string;
  receivablePayments: { id: string; saleId: string; amount: number; date: string }[];
  payablePayments: { id: string; purchaseId: string; amount: number; date: string }[];
  purchases: { id: string; productId: string; qty: number; unitCost: number; date: string; paymentMethod?: string; freightCost?: number; customsCost?: number; otherLandedCost?: number; taxAmount?: number }[];
  sales: { id: string; productId?: string; qty: number; date: string }[];
  // The cost of each sale as the app works it out (cost of sales from the product ledgers). When given, it is used so the journal and the balance sheet agree.
  saleCostOf?: (saleId: string) => number | undefined;
  unitCostOf: (productId: string) => number;
  loans: { id: string; principal: number; annualInterestRatePct: number; termMonths: number; startDate: string }[];
  fixedAssets: FixedAsset[];
}): { entries: JEntry[]; errors: string[] } {
  const entries: JEntry[] = [];
  const errors: string[] = [];
  const add = (e: JEntry | { error: string }) => { if ("error" in e) errors.push(e.error); else entries.push(e); };

  for (const p of input.receivablePayments) add(makeEntry(`recv:${p.id}`, p.date, "Customer paid", [{ account: "Cash", debit: p.amount, credit: 0 }, { account: "Accounts receivable", debit: 0, credit: p.amount }]));
  for (const p of input.payablePayments) add(makeEntry(`pay:${p.id}`, p.date, "Paid supplier", [{ account: "Accounts payable", debit: p.amount, credit: 0 }, { account: "Cash", debit: 0, credit: p.amount }]));

  for (const s of input.sales) {
    if (!s.productId) continue;
    const cost = r2(input.saleCostOf?.(s.id) ?? s.qty * input.unitCostOf(s.productId));
    if (cost > 0) add(makeEntry(`cogs:${s.id}`, s.date, "Cost of goods sold", [{ account: "Cost of sales", debit: cost, credit: 0 }, { account: "Inventory", debit: 0, credit: cost }]));
  }

  for (const p of input.purchases) {
    const goods = r2(p.qty * p.unitCost);
    const landed = r2((p.freightCost ?? 0) + (p.customsCost ?? 0) + (p.otherLandedCost ?? 0));
    const tax = r2(p.taxAmount ?? 0);
    const total = r2(goods + landed + tax);
    if (total <= 0) continue;
    const lines: JLine[] = [{ account: "Inventory", debit: r2(goods + landed), credit: 0 }];
    if (tax > 0) lines.push({ account: "Input tax recoverable", debit: tax, credit: 0 });
    lines.push({ account: p.paymentMethod === "credit" ? "Accounts payable" : "Cash", debit: 0, credit: total });
    add(makeEntry(`purchase:${p.id}`, p.date, "Stock bought", lines));
  }

  for (const loan of input.loans) {
    add(makeEntry(`loan-in:${loan.id}`, loan.startDate, "Loan received", [{ account: "Cash", debit: loan.principal, credit: 0 }, { account: "Loans payable", debit: 0, credit: loan.principal }]));
    const r = loan.annualInterestRatePct / 100 / 12;
    const pmt = r2(monthlyPayment(loan.principal, loan.annualInterestRatePct, loan.termMonths));
    const paid = Math.max(0, monthsBetween(loan.startDate, input.asOf));
    for (let k = 1; k <= Math.min(paid, loan.termMonths); k++) {
      const before = balanceAfter(loan.principal, loan.annualInterestRatePct, loan.termMonths, k - 1);
      const interest = r2(before * r);
      const principal = r2(pmt - interest);
      const date = `${addMonths(loan.startDate, k).slice(0, 7)}-${loan.startDate.slice(8, 10) > "28" ? "28" : loan.startDate.slice(8, 10)}`;
      add(makeEntry(`loan-pay:${loan.id}:${k}`, date, "Loan repayment", [
        { account: "Interest expense", debit: interest, credit: 0 },
        { account: "Loans payable", debit: principal, credit: 0 },
        { account: "Cash", debit: 0, credit: r2(interest + principal) },
      ]));
    }
  }

  for (const asset of input.fixedAssets) {
    if (asset.cost > 0) add(makeEntry(`asset:${asset.id}`, asset.purchaseDate, `Bought ${asset.name}`, [{ account: "Fixed assets (cost)", debit: asset.cost, credit: 0 }, { account: "Cash", debit: 0, credit: asset.cost }]));
    const startMonth = asset.purchaseDate.slice(0, 7);
    const months = Math.max(0, monthsBetween(startMonth, input.asOf.slice(0, 7)));
    let prev = 0;
    for (let k = 0; k <= months; k++) {
      const ym = addMonths(startMonth, k);
      const end = monthEnd(ym);
      if (end < asset.purchaseDate) continue;
      const acc = computeFixedAssetStatus(asset, end).accumulatedDepreciation;
      const charge = r2(acc - prev);
      prev = acc;
      if (charge > 0.005) add(makeEntry(`dep:${asset.id}:${ym}`, end, `Depreciation: ${asset.name}`, [{ account: "Depreciation expense", debit: charge, credit: 0 }, { account: "Accumulated depreciation", debit: 0, credit: charge }]));
    }
    // Disposal (v273): the asset leaves the books at cost, its accumulated depreciation is cleared, and the cash received is set against what was left (a gain or a loss).
    if (asset.disposalDate && asset.disposalDate <= input.asOf) {
      const acc = computeFixedAssetStatus(asset, asset.disposalDate).accumulatedDepreciation;
      add(disposalEntry(asset.id, asset.name, asset.disposalDate, asset.cost, acc, asset.disposalAmount ?? 0));
    }
  }
  return { entries, errors };
}

// The journal entry for selling or writing off an asset: cash in, accumulated depreciation cleared, cost removed, and the difference a gain or a loss. Balanced by
// construction; the function still checks it.
export function disposalEntry(assetId: string, name: string, date: string, cost: number, accumulated: number, proceeds: number): JEntry | { error: string } {
  const bookValue = r2(cost - accumulated);
  const gain = r2(proceeds - bookValue);
  const lines: JLine[] = [
    { account: "Cash", debit: proceeds, credit: 0 },
    { account: "Accumulated depreciation", debit: accumulated, credit: 0 },
    { account: "Fixed assets (cost)", debit: 0, credit: cost },
  ];
  if (gain > 0) lines.push({ account: "Gain on disposal", debit: 0, credit: gain });
  if (gain < 0) lines.push({ account: "Loss on disposal", debit: -gain, credit: 0 });
  return makeEntry(`dispose:${assetId}`, date, `Disposed: ${name}`, lines);
}

export const RECONCILE_LINES: { account: string; sheetKey: string; sign: 1 | -1 }[] = [
  { account: "Cash", sheetKey: "cash", sign: 1 },
  { account: "Accounts receivable", sheetKey: "accountsReceivable", sign: 1 },
  { account: "Inventory", sheetKey: "inventoryValue", sign: 1 },
  { account: "Accounts payable", sheetKey: "accountsPayable", sign: -1 },
  { account: "Loans payable", sheetKey: "loansPayable", sign: -1 },
  { account: "Sales tax payable", sheetKey: "salesTaxPayable", sign: -1 },
  { account: "Accrued costs", sheetKey: "accruedLiabilities", sign: -1 }, // v319: accruals not yet reversed (lib/accruals.ts)
];

// Compare the journal's balances with the balance sheet, line by line. Fixed assets are compared as cost less accumulated depreciation.
export function reconcile(entries: JEntry[], sheet: Record<string, number>, fixedAssetsNBV: number) {
  const { balances } = journalTotals(entries);
  const net = (acc: string) => balances.find((b) => b.account === acc)?.net ?? 0;
  const rows = RECONCILE_LINES.map((r) => {
    const journal = r2(net(r.account) * r.sign);
    const ref = r2(sheet[r.sheetKey] ?? 0);
    return { account: r.account, journal, sheet: ref, difference: r2(journal - ref), reconciles: Math.abs(journal - ref) < 0.01 };
  });
  const fixedJournal = r2(net("Fixed assets (cost)") + net("Accumulated depreciation"));
  rows.push({ account: "Fixed assets (net book value)", journal: fixedJournal, sheet: r2(fixedAssetsNBV), difference: r2(fixedJournal - fixedAssetsNBV), reconciles: Math.abs(fixedJournal - fixedAssetsNBV) < 0.01 });
  return rows;
}
