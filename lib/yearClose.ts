// Year-end close (v276). Locks a whole financial year against change, using the same lock date as the monthly close (booksClosedThrough). The close can only
// be done when: the months before December are already closed (so the year closes in order); the balance sheet balances; the trial balance balances; the
// journal balances and reconciles (the owner confirms this against the Journal screen); and the owner confirms the close. A year can only be moved forward:
// closing a year never reopens a closed one. Pure.

export interface YearCloseInput {
  year: number;
  booksClosedThrough?: string;
  balanceSheetBalances: boolean;
  trialBalanceBalanced: boolean;
  journalReconciledConfirmed: boolean;
  ownerConfirmed: boolean;
}
export interface YearStep { key: string; title: string; status: "done" | "attention"; detail: string }

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

export function yearEndIso(year: number): string { return `${year}-12-31`; }
export function novemberEndIso(year: number): string { return `${year}-11-30`; }

export function buildYearEndChecklist(i: YearCloseInput): { steps: YearStep[]; readyToClose: boolean; lockThrough: string; alreadyClosed: boolean } {
  const lockThrough = yearEndIso(i.year);
  const alreadyClosed = !!i.booksClosedThrough && i.booksClosedThrough >= lockThrough;
  const monthsDone = !!i.booksClosedThrough && i.booksClosedThrough >= novemberEndIso(i.year);
  const steps: YearStep[] = [
    { key: "months", title: "Months before December closed", status: monthsDone ? "done" : "attention", detail: monthsDone ? "The books are locked through November." : `Close the monthly books through ${novemberEndIso(i.year)} first.` },
    { key: "balance", title: "Balance sheet balances", status: i.balanceSheetBalances ? "done" : "attention", detail: i.balanceSheetBalances ? "Assets equal liabilities plus equity." : "The balance sheet does not balance. Fix it before closing the year." },
    { key: "trial", title: "Trial balance balances", status: i.trialBalanceBalanced ? "done" : "attention", detail: i.trialBalanceBalanced ? "Debits equal credits." : "The trial balance does not balance." },
    { key: "journal", title: "Journal reconciles to the balance sheet", status: i.journalReconciledConfirmed ? "done" : "attention", detail: i.journalReconciledConfirmed ? "Confirmed on the Journal screen." : "Open the Journal screen and confirm every reconciliation line agrees (or each difference is explained)." },
    { key: "owner", title: "Owner confirms the close", status: i.ownerConfirmed ? "done" : "attention", detail: i.ownerConfirmed ? "Confirmed." : "Only the owner can close the year, and closing it locks every dated record in it." },
  ];
  return { steps, readyToClose: steps.every((s) => s.status === "done") && !alreadyClosed, lockThrough, alreadyClosed };
}

export function yearEndLockUpdate(i: { year: number; booksClosedThrough?: string }): string | null {
  const target = yearEndIso(i.year);
  if (i.booksClosedThrough && i.booksClosedThrough > target) return `The books are already locked through ${i.booksClosedThrough}, which is later than ${target}; a year cannot be reopened by closing it.`;
  return null;
}
void pad;
