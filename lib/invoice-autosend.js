// lib/invoice-autosend.js - which invoices autopilot must NOT email by itself, and why. Pure; no database.
// A held invoice is still created (it stays open) and shows on Today, so the owner sends it with one tap.
//  - blocked: the address bounced, or the deal is marked Lost (the same transactional rule as quotes)
//  - over_cap: the total is above the owner's limit (autoInvoiceMax); null means no limit
export const HOLD_REASONS = ['blocked', 'over_cap'];

export function invoiceHold({ total = 0, cap = null, blocked = false } = {}) {
  if (blocked === true) return 'blocked';
  if (cap !== null && cap !== undefined && Number.isFinite(Number(cap)) && Number(total) > Number(cap)) return 'over_cap';
  return null;
}
