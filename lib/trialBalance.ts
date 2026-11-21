// Trial balance (v270). A list of every account balance at a date, with each one in its debit or credit column, to check that the books agree. This is the
// post-closing trial balance: the income and cost accounts have already been closed into retained earnings, so only the permanent accounts (assets,
// liabilities and equity) are listed. Debits must equal credits; if they do not, the lines do not reconcile to the balance sheet and the check says so.
// Pure: the caller passes the balance sheet.

export interface TbInput {
  cash: number; accountsReceivable: number; inventoryValue: number; fixedAssetsNetBookValue: number; investmentsValue: number;
  loansLentValue: number; supplierCredit: number; totalAssets: number;
  accountsPayable: number; loansPayable: number; accruedLiabilities: number; customerDeposits: number; salesTaxPayable: number; totalLiabilities: number;
  ownersCapital: number; retainedEarnings: number; unrealizedInvestmentGain: number; totalEquity: number;
}
export interface TbLine { account: string; side: "debit" | "credit"; amount: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

export function trialBalance(b: TbInput) {
  const assets: TbLine[] = [
    { account: "Cash", side: "debit", amount: b.cash },
    { account: "Accounts receivable", side: "debit", amount: b.accountsReceivable },
    { account: "Inventory", side: "debit", amount: b.inventoryValue },
    { account: "Fixed assets (net book value)", side: "debit", amount: b.fixedAssetsNetBookValue },
    { account: "Investments", side: "debit", amount: b.investmentsValue },
    { account: "Loans lent out", side: "debit", amount: b.loansLentValue },
    { account: "Credit held with suppliers", side: "debit", amount: b.supplierCredit },
  ];
  const liabilities: TbLine[] = [
    { account: "Accounts payable", side: "credit", amount: b.accountsPayable },
    { account: "Loans payable", side: "credit", amount: b.loansPayable },
    { account: "Accrued liabilities", side: "credit", amount: b.accruedLiabilities },
    { account: "Customer deposits", side: "credit", amount: b.customerDeposits },
    { account: "Sales tax payable", side: "credit", amount: b.salesTaxPayable },
  ];
  const equity: TbLine[] = [
    { account: "Owners' capital", side: "credit", amount: b.ownersCapital },
    { account: "Retained earnings", side: "credit", amount: b.retainedEarnings },
    { account: "Unrealised investment gain", side: "credit", amount: b.unrealizedInvestmentGain },
  ];
  const lines = [...assets, ...liabilities, ...equity].filter((l) => Math.abs(l.amount) > 0.005);
  const debits = r2(lines.filter((l) => l.side === "debit").reduce((t, l) => t + l.amount, 0));
  const credits = r2(lines.filter((l) => l.side === "credit").reduce((t, l) => t + l.amount, 0));
  const reconcilesToSheet = Math.abs(r2(assets.reduce((t, l) => t + l.amount, 0)) - r2(b.totalAssets)) < 0.01
    && Math.abs(r2(liabilities.reduce((t, l) => t + l.amount, 0) + equity.reduce((t, l) => t + l.amount, 0)) - r2(b.totalLiabilities + b.totalEquity)) < 0.01;
  return { lines, debits, credits, balanced: Math.abs(debits - credits) < 0.01, reconcilesToSheet };
}
