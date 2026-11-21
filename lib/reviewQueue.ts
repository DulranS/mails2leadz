// Owner review: the large entries a team member made, listed so the owner sees them, until someone marks them checked.
// It flags; it never blocks. A discount, expense, sales return or cash refund that a staff member, manager or accountant
// entered above the threshold (Settings > reviewAbove) goes on the list. Entries the owner made are not flagged, and
// entries with no recorded maker (made before this was recorded) are not flagged, because there is no one to ask.
//
// Pure: no I/O. The mark key is "kind:id", stored in the reviewMarks collection. See scripts/verify-review-queue.ts.
import { DISCOUNT_REASONS, type CustomerDepositEntry, type Discount, type Expense, type Member, type ReviewMark, type SaleReturn } from "./types";

export type ReviewKind = "discount" | "expense" | "return" | "refund";

export interface ReviewItem {
  key: string;
  kind: ReviewKind;
  date: string;
  amount: number;
  what: string;
  byName: string;
}

export interface ReviewInputs {
  threshold: number;
  discounts: Discount[];
  expenses: Expense[];
  returns: SaleReturn[];
  deposits: CustomerDepositEntry[];
  members: Pick<Member, "id" | "role" | "name">[];
  marks: ReviewMark[];
}

export const reviewKey = (kind: ReviewKind, id: string) => `${kind}:${id}`;

export function reviewQueue(i: ReviewInputs): ReviewItem[] {
  if (!(i.threshold > 0)) return [];
  const roleOf = new Map(i.members.map((m) => [m.id, m.role]));
  const checked = new Set(i.marks.map((m) => m.id));
  const out: ReviewItem[] = [];
  const consider = (kind: ReviewKind, id: string, uid: string | undefined, amount: number, date: string, what: string, byName?: string) => {
    if (!uid || !(amount > i.threshold)) return;
    const role = roleOf.get(uid);
    if (!role || role === "owner") return;
    const key = reviewKey(kind, id);
    if (checked.has(key)) return;
    out.push({ key, kind, date, amount, what, byName: byName || "Unknown" });
  };
  for (const d of i.discounts) {
    const reason = DISCOUNT_REASONS.find((r) => r.value === d.reason)?.label ?? "Discount";
    consider("discount", d.id, d.createdByUid, d.amount, d.date, `Discount: ${reason}`, d.createdByName);
  }
  for (const x of i.expenses) consider("expense", x.id, x.createdByUid, x.amount, x.startDate, `Expense: ${x.name}`, x.createdByName);
  for (const r of i.returns) consider("return", r.id, r.createdByUid, r.refundAmount, r.date, "Sales return", r.createdByName);
  for (const d of i.deposits) {
    if (d.kind !== "refunded") continue;
    consider("refund", d.id, d.createdByUid, d.amount, d.date, `Deposit refunded to ${d.customer}`, d.createdByName);
  }
  out.sort((a, b) => b.amount - a.amount || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}
