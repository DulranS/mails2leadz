// Late payment charge: a simple monthly rate on what is still owed once an invoice is past its due date plus a grace
// period. OFF unless the owner turns it on in Settings, and meant only for a business whose agreed terms with its
// customers include one.
//
// Advisory and derived. It is shown beside an overdue invoice and in the reminder wording, and it is NOT posted: it is
// not added to what the customer owes in the books, to revenue, to tax or to any statement. If the owner decides to
// charge it, they bill it like any other sale. So no existing figure can change because this is switched on.
import type { Settings } from "./types";

export interface LateFeeTerms {
  monthlyPct: number; // % of the outstanding amount per 30 days overdue
  graceDays: number; // days after the due date before any charge builds up
}

export const MAX_LATE_FEE_MONTHLY_PCT = 10; // anything above this is almost certainly a typing slip

export function lateFeeTerms(settings: Pick<Settings, "lateFeeMonthlyPct" | "lateFeeGraceDays">): LateFeeTerms | null {
  const pct = settings.lateFeeMonthlyPct;
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct <= 0 || pct > MAX_LATE_FEE_MONTHLY_PCT) return null;
  const grace = settings.lateFeeGraceDays;
  return { monthlyPct: pct, graceDays: typeof grace === "number" && Number.isFinite(grace) && grace > 0 ? Math.floor(grace) : 0 };
}

// Simple (not compounding) charge that has built up so far: outstanding x rate x (days past the grace period) / 30.
export function computeLateCharge(outstanding: number, daysOverdue: number, terms: LateFeeTerms | null): number {
  if (!terms || !(outstanding > 0) || !Number.isFinite(daysOverdue)) return 0;
  const chargeableDays = Math.max(0, daysOverdue - terms.graceDays);
  return (outstanding * (terms.monthlyPct / 100) * chargeableDays) / 30;
}

// Convenience for a receivable line: 0 when the feature is off or nothing has built up yet.
export function lateChargeFor(
  line: { amountOutstanding: number; daysOverdue: number },
  settings: Pick<Settings, "lateFeeMonthlyPct" | "lateFeeGraceDays">
): number {
  return computeLateCharge(line.amountOutstanding, line.daysOverdue, lateFeeTerms(settings));
}

// ---------------------------------------------------------------------------
// Billing the late charge (the owner's tap, never automatic). It is recorded as an ordinary sale of a service item
// to the same customer, carrying the key of the invoice it was charged on (Sale.lateFeeForKey), so a second tap
// bills only what has built up since, and never the same days twice.
// ---------------------------------------------------------------------------

const cents = (n: number) => Math.round(n * 100) / 100;

// What has already been billed on an invoice: the price (before any tax) of every sale carrying its key.
export function lateFeeBilledFor(sales: { lateFeeForKey?: string; unitPrice: number; qty: number }[], key: string): number {
  if (!key) return 0;
  let total = 0;
  for (const s of sales) if (s.lateFeeForKey === key) total += s.unitPrice * s.qty;
  return cents(total);
}

// What is still to bill: what has built up, less what was billed. Never negative; under half a cent is nothing.
export function lateFeeStillDue(accrued: number, billed: number): number {
  const due = cents((Number.isFinite(accrued) ? accrued : 0) - (Number.isFinite(billed) ? billed : 0));
  return due >= 0.01 ? due : 0;
}

// The key a receivable line's late charge is billed under: a grouped invoice by its invoice id, else its one sale.
export function lateFeeKeyFor(line: { invoiceId?: string; saleId: string }): string {
  return line.invoiceId ? `inv:${line.invoiceId}` : `sale:${line.saleId}`;
}
