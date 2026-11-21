// Shared write path for server-side (Admin SDK) confirmation of an
// AI-proposed sale/purchase/expense. Its only caller is app/api/ai/auto-confirm,
// i.e. the two explicit, human-triggered shortcuts ("Confirm all" on the
// Assistant page and the Quick Entry modal's "Save without reviewing"). The
// chat route never writes to the ledger — every proposal it returns is pending.
//
// Deliberately mirrors contexts/DataContext.tsx's addSale/addPurchase/
// addExpense as closely as an Admin-SDK route can: same dueDate-from-
// creditTermDays computation for a credit sale, same shape of audit-log
// entry (so this doesn't create a second, differently-shaped trail from
// the one every other write path in the app produces). The one thing it
// can't do is call the client's requirePermission/logAudit closures
// directly (those live in React state) — requireAiContext already pins the
// caller to Owner/Manager before any of this runs, which is the same
// permission floor addSale/addPurchase/addExpense enforce.

import type { Firestore } from "firebase-admin/firestore";
import type { ProposedEntry, ProposedSaleEntry, ProposedPurchaseEntry, ProposedExpenseEntry } from "./aiTypes";
import type { Sale, Purchase, Expense, Settings } from "./types";
import { assertPeriodOpen, isValidIsoDate } from "./periodLock";
import { taxFor } from "./tax";

function addDaysToDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

async function logAudit(
  db: Firestore,
  businessId: string,
  uid: string,
  memberName: string | null,
  entity: string,
  entityId: string,
  action: "create",
  summary: string
): Promise<void> {
  // Best-effort, same as the client's logAudit — never let a slow/failed
  // audit write fail (or delay the response for) the actual transaction.
  try {
    await db.collection(`users/${businessId}/auditLog`).add({
      at: Date.now(),
      byUid: uid,
      byName: memberName ?? "AI Assistant",
      byRole: "owner", // requireAiContext already restricted the caller to owner/manager; the audit trail doesn't distinguish further here
      action,
      entity,
      entityId,
      summary,
    });
  } catch {
    /* deliberately swallowed */
  }
}

export interface AutoConfirmDeps {
  db: Firestore;
  businessId: string;
  uid: string;
  memberName: string | null;
  settings: Settings;
}

// A proposal is safe to write without a human ever looking at it only once
// every field that would otherwise default silently (qty=1, price=0,
// category="Other overhead"...) is actually known — a $0 price or an
// unmatched product is exactly the case that needs a person, not a
// guess. This is intentionally the SAME bar for "auto-fill and log
// automatically" vs. "ask the user only when required information is
// missing": the pre-filled review form (ProposedEntryCard) IS how the
// user is asked, for whatever this function says isn't safe to skip.
//
// Two more cases belong in that same "needs a person" bucket, both added
// after the fact once traced end to end:
//
// - A foreign-currency entry. propose_entries only ever reports the raw
//   amount the user stated (see that tool's schema) — it never carries an
//   exchange rate, because the model has no reliable way to know one. The
//   ONLY place an exchange rate is ever collected is the review form
//   (QuickSaleForm/QuickStockForm's CurrencyRateFields, wired to `initial`
//   in ProposedEntryCard). Auto-confirming a `currency`-tagged entry would
//   silently write that raw foreign amount into `unitPrice`/`unitCost` —
//   the field every P&L/margin calculation reads as base-currency — with
//   no conversion applied at all.
// - A weak product match. lib/aiMatch.ts's bestMatch() will return a match
//   at a fairly low bar (0.45) so there's always *something* to show a
//   human reviewer — but a match that shaky shouldn't be indistinguishable
//   from an exact one once it reaches here. MIN_AUTO_CONFIRM_MATCH_CONFIDENCE
//   is deliberately well above that floor: high enough that only a
//   genuinely confident match (exact name, or the product name cleanly
//   contained in what the user said) skips review.
const MIN_AUTO_CONFIRM_MATCH_CONFIDENCE = 0.7;

export function isAutoConfirmable(entry: ProposedEntry): boolean {
  // A date that isn't a real YYYY-MM-DD calendar date came from the model
  // and was never checked ("yesterday", "2026-13-40"). It would be filed
  // under a month that doesn't exist, so it always needs a person.
  if (!isValidIsoDate(entry.date)) return false;
  if (entry.kind === "sale") {
    return (
      Boolean(entry.matchedProductId) &&
      (entry.matchConfidence ?? 0) >= MIN_AUTO_CONFIRM_MATCH_CONFIDENCE &&
      !entry.currency &&
      entry.qty > 0 &&
      entry.unitPrice > 0
    );
  }
  if (entry.kind === "purchase") {
    return (
      Boolean(entry.matchedProductId) &&
      (entry.matchConfidence ?? 0) >= MIN_AUTO_CONFIRM_MATCH_CONFIDENCE &&
      !entry.currency &&
      entry.qty > 0 &&
      entry.unitCost > 0
    );
  }
  if (entry.kind === "expense") {
    return entry.name.trim().length > 0 && entry.amount > 0;
  }
  return false;
}

export async function autoConfirmSale(deps: AutoConfirmDeps, entry: ProposedSaleEntry): Promise<string> {
  if (!entry.matchedProductId) throw new Error("Cannot log a sale without a matched product.");
  const { db, businessId, uid, memberName, settings } = deps;

  const paymentMethod = entry.paymentMethod ?? "cash";
  const dueDate = paymentMethod === "credit" ? addDaysToDate(entry.date, settings.defaultCreditTermDays) : undefined;
  // Sales tax, computed exactly as the sale form does (untaxed revenue x rate,
  // snapshotted onto the sale). Without this an auto-saved sale silently
  // dropped its tax while the same sale saved through the review form kept it,
  // understating both the tax owed and what a credit customer owes. Foreign-
  // currency entries never reach here (isAutoConfirmable refuses them).
  // The item's own tax rate (Product.taxRatePct) when it has one, else the shop rate: the same rule the sale form uses.
  const productSnap = await db.doc(`users/${businessId}/products/${entry.matchedProductId}`).get();
  const taxAmount = taxFor(entry.qty * entry.unitPrice, productSnap.data() as { taxRatePct?: number } | undefined, settings);

  const sale: Omit<Sale, "id"> = {
    productId: entry.matchedProductId,
    qty: entry.qty,
    unitPrice: entry.unitPrice,
    date: entry.date,
    customer: entry.customer,
    customerContact: undefined,
    notes: entry.notes,
    paymentMethod,
    creditTermDays: paymentMethod === "credit" ? settings.defaultCreditTermDays : undefined,
    dueDate,
    currency: entry.currency,
    exchangeRate: undefined,
    foreignUnitPrice: undefined,
    taxAmount: taxAmount > 0 ? taxAmount : undefined,
    createdByUid: uid,
    createdByName: memberName || "AI Assistant",
    createdAt: Date.now(),
  };

  const ref = await db.collection(`users/${businessId}/sales`).add(sale);
  await logAudit(
    db,
    businessId,
    uid,
    memberName,
    "sale",
    ref.id,
    "create",
    `Sale: ${entry.qty} × ${entry.unitPrice.toLocaleString()} (logged by AI Assistant)`
  );
  return ref.id;
}

export async function autoConfirmPurchase(deps: AutoConfirmDeps, entry: ProposedPurchaseEntry): Promise<string> {
  if (!entry.matchedProductId) throw new Error("Cannot log a purchase without a matched product.");
  const { db, businessId, uid, memberName, settings } = deps;

  // Mirrors autoConfirmSale's credit handling exactly — these three fields
  // were hardcoded to undefined back when nothing in the app could express
  // a credit purchase at all, which quietly turned every "bought on terms"
  // into cash out the door on the delivery date.
  const paymentMethod = entry.paymentMethod ?? "cash";
  const creditTermDays = paymentMethod === "credit" ? settings.defaultCreditTermDays : undefined;

  const purchase: Omit<Purchase, "id"> = {
    productId: entry.matchedProductId,
    qty: entry.qty,
    unitCost: entry.unitCost,
    date: entry.date,
    supplier: entry.supplier,
    notes: entry.notes,
    paymentMethod,
    creditTermDays,
    dueDate: paymentMethod === "credit" ? addDaysToDate(entry.date, settings.defaultCreditTermDays) : undefined,
    currency: entry.currency,
    exchangeRate: undefined,
    foreignUnitCost: undefined,
    createdAt: Date.now(),
  };

  const ref = await db.collection(`users/${businessId}/purchases`).add(purchase);
  await logAudit(
    db,
    businessId,
    uid,
    memberName,
    "purchase",
    ref.id,
    "create",
    `Purchase: ${entry.qty} × ${entry.unitCost.toLocaleString()} (logged by AI Assistant)`
  );
  return ref.id;
}

export async function autoConfirmExpense(deps: AutoConfirmDeps, entry: ProposedExpenseEntry): Promise<string> {
  const { db, businessId, uid, memberName } = deps;

  const expense: Omit<Expense, "id"> = {
    name: entry.name,
    amount: entry.amount,
    category: entry.category || "Other overhead",
    kind: "expense",
    isRecurring: entry.isRecurring,
    recurrence: entry.isRecurring ? "monthly" : "none",
    startDate: entry.date,
    endDate: undefined,
    employeeId: undefined,
    projectId: undefined,
    // Same reasoning as projectId: an AI-entered expense is shared overhead
    // until a person tags it to a location on the Expenses screen.
    locationId: undefined,
    createdAt: Date.now(),
  };

  const ref = await db.collection(`users/${businessId}/expenses`).add(expense);
  await logAudit(
    db,
    businessId,
    uid,
    memberName,
    "expense",
    ref.id,
    "create",
    `Expense: ${entry.name}, ${entry.amount.toLocaleString()} (logged by AI Assistant)`
  );
  return ref.id;
}

export async function autoConfirmEntry(deps: AutoConfirmDeps, entry: ProposedEntry): Promise<string> {
  // Enforced here, not just by the chat route's own `isAutoConfirmable`
  // check before calling this — this function is also the direct entry
  // point for app/api/ai/auto-confirm ("⚡ Auto-confirm all" / the Quick
  // Entry modal's checkbox), which force-writes whatever proposals it's
  // handed with no gate of its own. Putting the check here means every
  // current and future caller gets it for free, rather than relying on
  // each one to remember to check first.
  if (!isAutoConfirmable(entry)) {
    throw new Error(
      "This entry needs a quick look before it can be logged automatically — review it below."
    );
  }
  // Period lock (lib/periodLock.ts). This route writes with the Admin SDK,
  // which bypasses every client-side check, so the lock has to be applied
  // here too. The settings are read fresh rather than taken from deps:
  // loadBusinessContext caches them for 30 s, and a lock the owner set a
  // few seconds ago must already hold. A recurring expense is a schedule,
  // not a dated one-off, so it is not frozen (same rule as the app).
  if (!(entry.kind === "expense" && entry.isRecurring)) {
    const snap = await deps.db.doc(`users/${deps.businessId}/meta/settings`).get();
    assertPeriodOpen(snap.data()?.booksClosedThrough, [entry.date]);
  }
  if (entry.kind === "sale") return autoConfirmSale(deps, entry);
  if (entry.kind === "purchase") return autoConfirmPurchase(deps, entry);
  if (entry.kind === "expense") return autoConfirmExpense(deps, entry);
  throw new Error("Unknown entry kind");
}
