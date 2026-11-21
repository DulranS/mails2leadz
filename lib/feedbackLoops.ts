// Feedback loops (v234): (1) product iteration: a customer complaint or suggestion becomes an improvement with one owner and one due day, and
// overdue ones are seen; (2) supply chain: a product bought from one supplier gets a named alternative, which is compared on price before it is
// trusted, and single-source products with no alternative are listed. Pure: no I/O.

export const IMPROVEMENT_STATUSES = ["open", "done", "dropped"] as const;
export type ImprovementStatus = (typeof IMPROVEMENT_STATUSES)[number];
export const ALTERNATIVE_STATUSES = ["considering", "trial", "approved", "rejected"] as const;
export type AlternativeStatus = (typeof ALTERNATIVE_STATUSES)[number];
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(Date.parse(`${s}T00:00:00Z`)).toISOString().slice(0, 10) === s;

export interface Improvement {
  id: string;
  title: string;
  source: "customer" | "team" | "supplier" | "other";
  owner: string;
  dueDate: string;
  status: ImprovementStatus;
  notes?: string;
  doneOn?: string;
}

export function validateImprovement(i: { title: string; owner: string; dueDate: string; source: string }): string | null {
  if (!i.title || i.title.trim().length < 8) return "Say what should change, in a short sentence.";
  if (!i.owner || i.owner.trim().length < 2) return "Name the person who will make the change.";
  if (!isDay(i.dueDate)) return "Enter the day it should be done by.";
  if (!["customer", "team", "supplier", "other"].includes(i.source)) return "Choose where the idea came from.";
  return null;
}

export function improvementSummary(items: Improvement[], today: string) {
  const open = items.filter((i) => i.status === "open");
  const overdue = open.filter((i) => i.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const fromCustomers = items.filter((i) => i.source === "customer").length;
  const doneFromCustomers = items.filter((i) => i.source === "customer" && i.status === "done").length;
  return { open: open.length, overdue, fromCustomers, doneFromCustomers };
}

export interface Alternative { id: string; productId: string; currentSupplier: string; alternative: string; quoteUnitCost: number; status: AlternativeStatus; notes?: string }

export function validateAlternative(i: { productId: string; alternative: string; quoteUnitCost: number }): string | null {
  if (!i.productId) return "Which product is this for?";
  if (!i.alternative || i.alternative.trim().length < 2) return "Name the alternative supplier.";
  if (!Number.isFinite(i.quoteUnitCost) || i.quoteUnitCost <= 0) return "Enter the quoted price per unit.";
  return null;
}

// The quote against the price being paid now: a negative difference means the alternative is cheaper.
export function compareQuote(currentUnitCost: number, quoteUnitCost: number) {
  if (!(currentUnitCost > 0)) return null;
  const differencePct = Math.round(((quoteUnitCost - currentUnitCost) / currentUnitCost) * 1000) / 10;
  return { differencePct, cheaper: quoteUnitCost < currentUnitCost };
}

// Single-source products that have no alternative still being considered, trialled or approved.
export function uncoveredSingleSource(singleSourceProductIds: string[], alternatives: Alternative[]): string[] {
  const covered = new Set(alternatives.filter((a) => a.status !== "rejected").map((a) => a.productId));
  return singleSourceProductIds.filter((id) => !covered.has(id));
}
