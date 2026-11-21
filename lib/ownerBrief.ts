// The weekly owner brief: the figures, the prompt, and the check that the written brief uses only those figures. Pure.
// The AI only phrases numbers that are computed here; it is never asked to calculate. A brief that quotes a figure not in
// the facts is refused, so an invented number never reaches the owner.
import type { Discount, Expense, Lead, ReceivablePayment, Sale, SaleReturn } from "./types";
import { groupSalesByInvoice } from "./calculations";
import { summariseInvoice } from "./invoicePortal";

export interface BriefFacts {
  salesThisWeek: number; // sales value this week, before returns, discounts and tax
  salesLastWeek: number;
  salesCountThisWeek: number;
  cashCollectedThisWeek: number; // customer payments recorded this week
  oneOffExpensesThisWeek: number; // one-off expenses dated this week. Recurring costs are not included (see the card)
  overdueOwed: number; // balance on credit invoices past their due date
  overdueInvoices: number;
  newLeadsThisWeek: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function addDaysIso(iso: string, days: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

// "This week" = the seven days ending today; "last week" = the seven before that.
export function buildBriefFacts(input: {
  sales: Sale[];
  payments: ReceivablePayment[];
  expenses: Expense[];
  leads: Lead[];
  returns: SaleReturn[];
  discounts: Discount[];
  today: string;
}): BriefFacts {
  const { sales, payments, expenses, leads, returns, discounts, today } = input;
  const weekStart = addDaysIso(today, -6);
  const lastWeekStart = addDaysIso(today, -13);
  const lastWeekEnd = addDaysIso(today, -7);
  const inThis = (d: string | undefined) => !!d && d >= weekStart && d <= today;
  const inLast = (d: string | undefined) => !!d && d >= lastWeekStart && d <= lastWeekEnd;

  const thisSales = sales.filter((s) => inThis(s.date));
  const salesThisWeek = round2(thisSales.reduce((sum, s) => sum + s.qty * s.unitPrice, 0));
  const salesLastWeek = round2(sales.filter((s) => inLast(s.date)).reduce((sum, s) => sum + s.qty * s.unitPrice, 0));
  const cashCollectedThisWeek = round2(payments.filter((p) => inThis(p.date)).reduce((sum, p) => sum + p.amount, 0));
  const oneOffExpensesThisWeek = round2(
    expenses.filter((e) => e.kind === "expense" && !e.isRecurring && inThis(e.startDate)).reduce((sum, e) => sum + e.amount, 0)
  );
  const newLeadsThisWeek = leads.filter((l) => {
    const created = (l as { createdAt?: number }).createdAt;
    return typeof created === "number" && inThis(new Date(created).toISOString().slice(0, 10));
  }).length;

  // Overdue owed uses the same invoice arithmetic as the customer link and the Invoices page.
  let overdueOwed = 0;
  let overdueInvoices = 0;
  const creditSales = sales.filter((s) => (s.paymentMethod ?? "cash") === "credit");
  for (const group of groupSalesByInvoice(creditSales)) {
    const groupIds = new Set(group.sales.map((s) => s.id));
    const sum = summariseInvoice({
      sales: group.sales,
      returns: returns.filter((r) => groupIds.has(r.saleId)),
      discounts: discounts.filter((d) => groupIds.has(d.saleId)),
      payments: payments.filter((p) => groupIds.has(p.saleId)),
      today,
    });
    if (sum.status === "overdue") {
      overdueOwed += sum.balance;
      overdueInvoices += 1;
    }
  }

  return {
    salesThisWeek,
    salesLastWeek,
    salesCountThisWeek: thisSales.length,
    cashCollectedThisWeek,
    oneOffExpensesThisWeek,
    overdueOwed: round2(overdueOwed),
    overdueInvoices,
    newLeadsThisWeek,
  };
}

// The server re-checks the shape before it spends a model call.
export function validateBriefFacts(value: unknown): BriefFacts | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const keys: (keyof BriefFacts)[] = [
    "salesThisWeek", "salesLastWeek", "salesCountThisWeek", "cashCollectedThisWeek", "oneOffExpensesThisWeek", "overdueOwed", "overdueInvoices", "newLeadsThisWeek",
  ];
  const out = {} as BriefFacts;
  for (const k of keys) {
    const n = v[k];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1e12) return null;
    out[k] = n;
  }
  return out;
}

export function buildBriefPrompt(facts: BriefFacts, business: { name?: string; currency: string }): { system: string; user: string } {
  const money = (n: number) => `${business.currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const system = [
    "You write a short weekly brief for the owner of a small business, from figures the app has already computed.",
    "Rules: use ONLY the figures given. Do not calculate new numbers, percentages or totals. Do not guess causes or predict.",
    "Write 4 to 6 plain sentences, then one line starting 'Next:' with one practical action. No headings, no bullet points.",
    "Say plainly when a figure is zero or missing. Keep the tone calm and direct.",
  ].join(" ");
  const user = [
    `Business: ${business.name?.trim() || "this business"}`,
    `Sales this week (before returns, discounts and tax): ${money(facts.salesThisWeek)} across ${facts.salesCountThisWeek} sale lines`,
    `Sales the week before: ${money(facts.salesLastWeek)}`,
    `Customer payments received this week: ${money(facts.cashCollectedThisWeek)}`,
    `One-off expenses dated this week (recurring costs are not included): ${money(facts.oneOffExpensesThisWeek)}`,
    `Overdue customer balances: ${money(facts.overdueOwed)} across ${facts.overdueInvoices} invoice(s)`,
    `New leads this week: ${facts.newLeadsThisWeek}`,
  ].join("\n");
  return { system, user };
}

// Every number in the brief must be a figure from the facts (or a small count such as "7 days"). Otherwise it is refused.
export function briefUsesOnlyGivenFigures(text: string, facts: BriefFacts): boolean {
  // A percentage is always a calculated figure, so it is refused whatever its value.
  if (text.includes("%") || /\bpercent\b/i.test(text)) return false;
  const allowed = Object.values(facts).flatMap((n) => [n, Math.round(n), Math.round(n * 100) / 100]);
  const tokens = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return tokens.every((t) => {
    const n = Number(t.replace(/,/g, ""));
    if (!Number.isFinite(n)) return false;
    if (n <= 10) return true; // small counts such as "3 invoices" or "7 days"
    return allowed.some((a) => Math.abs(a - n) < 1.01);
  });
}

export function finalizeBrief(text: unknown, facts: BriefFacts): string | null {
  if (typeof text !== "string") return null;
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 1200);
  if (clean.length < 40) return null;
  return briefUsesOnlyGivenFigures(clean, facts) ? clean : null;
}
