// Weekly numbers for the owner (v282): the week's sales, expenses and what is left between them, in a short email. It is a quick read of the week, not the
// accounting profit: the full profit and balance sheet are in Balancr. Pure.
export interface WnSale { date: string; qty: number; unitPrice: number }
export interface WnExpense { date: string; amount: number }

const r2 = (n: number) => Math.round(n * 100) / 100;
const inWeek = (d: string, from: string, to: string) => d >= from && d <= to;

export function weeklyNumbers(i: { businessName: string; from: string; to: string; sales: WnSale[]; expenses: WnExpense[] }) {
  const sales = i.sales.filter((s) => inWeek(s.date, i.from, i.to));
  const expenses = i.expenses.filter((e) => inWeek(e.date, i.from, i.to));
  const salesTotal = r2(sales.reduce((t, s) => t + s.qty * s.unitPrice, 0));
  const expensesTotal = r2(expenses.reduce((t, e) => t + e.amount, 0));
  const left = r2(salesTotal - expensesTotal);
  const subject = `${i.businessName}: your week to ${i.to}`;
  const text = [
    `Your week, ${i.from} to ${i.to}`,
    "",
    `Sales: ${salesTotal} (${sales.length} sale${sales.length === 1 ? "" : "s"})`,
    `Expenses: ${expensesTotal} (${expenses.length} entr${expenses.length === 1 ? "y" : "ies"})`,
    `Left over: ${left}`,
    "",
    "This is sales less expenses for the week. It is not the accounting profit.",
    "The full profit and balance sheet are in Balancr.",
  ].join("\n");
  return { subject, text, salesTotal, expensesTotal, left, salesCount: sales.length, expenseCount: expenses.length };
}

// The week that ended on the Sunday before `today` (ISO date): Monday to Sunday.
export function previousWeek(today: string): { from: string; to: string } {
  const d = new Date(`${today}T00:00:00Z`);
  const dow = d.getUTCDay() || 7; // Mon=1..Sun=7
  const toD = new Date(d.getTime() - dow * 86400000);
  const fromD = new Date(toD.getTime() - 6 * 86400000);
  return { from: fromD.toISOString().slice(0, 10), to: toD.toISOString().slice(0, 10) };
}
