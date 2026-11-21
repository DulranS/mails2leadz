// Turning a project billing milestone into a real sale (the one-tap "Record in books" on a milestone).
//
// A milestone amount is whatever was quoted to the client. It may include sales tax or not, and the schedule
// does not say, so the owner picks. This works out the untaxed price, the tax and the total the customer owes,
// using the item's own tax rate (lib/tax.ts). Money is rounded to the cent and the three parts always add up
// to the total: tax is the rounded remainder, never rounded separately.

export interface MilestoneSaleAmounts {
  net: number; // untaxed price, becomes the sale's unit price (qty 1)
  tax: number; // sales tax, becomes the sale's taxAmount (0 = none)
  total: number; // what the customer owes for this milestone
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function milestoneSaleAmounts(amount: number, amountIncludesTax: boolean, ratePct: number): MilestoneSaleAmounts | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const rate = Number.isFinite(ratePct) && ratePct > 0 ? ratePct : 0;
  if (rate === 0) return { net: cents(amount), tax: 0, total: cents(amount) };
  if (amountIncludesTax) {
    const total = cents(amount);
    const net = cents(total / (1 + rate / 100));
    return { net, tax: cents(total - net), total };
  }
  const net = cents(amount);
  const tax = cents(net * (rate / 100));
  return { net, tax, total: cents(net + tax) };
}

// A milestone that already points at a sale must not be recorded again.
export function milestoneAlreadyRecorded(m: { saleInvoiceId?: string | null }): boolean {
  return typeof m.saleInvoiceId === "string" && m.saleInvoiceId.trim() !== "";
}
