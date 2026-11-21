// Till payouts (v292): cash taken out of the till for a small spend (a delivery fee, an errand, a tea run), written down by whoever took it,
// so a cash count can account for it instead of showing an unexplained shortfall.
//
// The rule that keeps the books honest: a payout is cash out on its date UNTIL an owner or manager records it as an expense.
// After that the expense is the record, and the payout must not be counted again. So a cash count subtracts only the payouts
// that have no expenseId, and recording a payout as an expense never changes the count's arithmetic.
//
// Pure: no I/O. Amounts in the business's currency.
import type { TillPayout } from "./types";

export interface TillPayoutInput {
  date: string; // ISO date the cash left the till
  amount: number;
  reason: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REASON = 200;

export function validateTillPayout(
  input: TillPayoutInput
): { ok: true; value: TillPayoutInput } | { ok: false; error: string } {
  const amount = Number(input.amount);
  const reason = String(input.reason ?? "").trim();
  if (!ISO_DATE.test(input.date ?? "")) return { ok: false, error: "Pick the date the cash was taken" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter the amount taken out, more than zero" };
  if (!reason) return { ok: false, error: "Say what the cash was spent on" };
  if (reason.length > MAX_REASON) return { ok: false, error: `Keep the reason under ${MAX_REASON} characters` };
  return { ok: true, value: { date: input.date, amount: Math.round(amount * 100) / 100, reason } };
}

/** Cash taken out of the till on one date that no expense has recorded yet. Recorded payouts are left out: their expense is counted instead. */
export function unrecordedTillOutflow(payouts: TillPayout[], date: string): number {
  const total = payouts
    .filter((p) => p.date === date && !p.expenseId)
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  return Math.round(total * 100) / 100;
}

/** The one-off expense a payout becomes when an owner or manager records it. Same shape as the other one-off expenses. */
export function expenseFromTillPayout(p: TillPayout, category: string) {
  return {
    name: p.reason,
    amount: p.amount,
    category,
    kind: "expense" as const,
    isRecurring: false,
    recurrence: "none" as const,
    startDate: p.date,
    paymentStatus: "paid" as const,
  };
}
