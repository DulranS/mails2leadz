// Quote revisions, the customer's online answer to a quote, and which quotes need chasing. Pure: no I/O, so the server
// routes and the Estimates page apply exactly the same rules.
//
// The money decision (strategy, Nov 2026): when a quote is revised after the customer has already paid a deposit, the
// difference is kept as a CREDIT on their account (the customer deposit balance in lib/customerDeposits.ts), not refunded
// automatically. Why: a cash refund sends money out, loses the sale, and usually loses the customer; a credit keeps the
// cash in the business and the customer coming back, and it is fully traceable. Cash is refunded only when the owner
// decides to, from Customer deposits, which is the existing audited path.
import type { Estimate } from "./types";

export const QUOTE_LINK_DAYS = 60; // how long a customer link works
export const QUOTE_CHASE_WINDOW_DAYS = 7; // quotes expiring within this many days are listed to chase

const round2 = (n: number) => Math.round(n * 100) / 100;

export function quoteSubtotal(lines: { qty: number; unitPrice: number }[]): number {
  return round2(lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0));
}

export interface RevisionSettlement {
  newTotal: number; // the revised quote's subtotal, before any tax the caller adds
  depositHeld: number; // what the customer already holds with the business
  creditToKeep: number; // held more than the new total: stays on their account as a credit. Never refunded automatically.
  stillDue: number; // new total not yet covered by what they hold
}

export function computeRevisionSettlement(newTotal: number, depositHeld: number): RevisionSettlement {
  const total = round2(Math.max(0, newTotal));
  const held = round2(Math.max(0, depositHeld));
  return {
    newTotal: total,
    depositHeld: held,
    creditToKeep: round2(Math.max(0, held - total)),
    stillDue: round2(Math.max(0, total - held)),
  };
}

// The sentence the owner reads before saving a revision. Kept here so the wording (and the credit-not-refund rule) lives
// in one place.
export function settlementMessage(s: RevisionSettlement, customer: string): string | null {
  if (s.depositHeld <= 0) return null;
  const who = customer.trim() || "This customer";
  if (s.creditToKeep > 0) {
    return `${who} already holds ${s.depositHeld} with you. The revised total is ${s.newTotal}, so ${s.creditToKeep} stays on their account as a credit for their next invoice. Nothing is refunded automatically. Refund it in cash only if they ask, from Customer deposits.`;
  }
  return `${who} already holds ${s.depositHeld} with you. ${s.stillDue} is still due on the revised total.`;
}

// Why a customer can or cannot answer a quote online right now. null means they can.
export type QuoteDecisionBlock = "replaced" | "converted" | "decided" | "expired" | "not_sent";

export function quoteDecisionBlock(
  e: Pick<Estimate, "status" | "validUntil" | "supersededBy">,
  today: string
): QuoteDecisionBlock | null {
  if (e.supersededBy || e.status === "revised") return "replaced";
  if (e.status === "converted") return "converted";
  if (e.status === "accepted" || e.status === "declined") return "decided";
  if (e.status === "expired") return "expired";
  if (e.status !== "sent") return "not_sent";
  if (e.validUntil && e.validUntil < today) return "expired";
  return null;
}

export const QUOTE_BLOCK_MESSAGE: Record<QuoteDecisionBlock, string> = {
  replaced: "This quote has been replaced by a newer version. Ask the business for the latest one.",
  converted: "This quote has already been turned into an invoice.",
  decided: "You have already answered this quote.",
  expired: "This quote has expired. Ask the business for a fresh one.",
  not_sent: "This quote is not open for an answer yet.",
};

// Whole days from `from` to `to` (YYYY-MM-DD). Positive when `to` is later.
export function daysBetweenIso(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export interface QuoteFollowUp {
  estimate: Estimate;
  daysLeft: number; // negative once expired
  state: "expiring" | "expired";
}

// Quotes that were sent, still waiting on the customer, and whose validity date is close or past. Sorted most urgent
// first. Quotes with no validity date are not listed: there is no date to chase against.
export function quotesNeedingFollowUp(estimates: Estimate[], today: string, windowDays = QUOTE_CHASE_WINDOW_DAYS): QuoteFollowUp[] {
  const out: QuoteFollowUp[] = [];
  for (const e of estimates) {
    if (e.status !== "sent" || e.supersededBy || !e.validUntil) continue;
    const daysLeft = daysBetweenIso(today, e.validUntil);
    if (daysLeft > windowDays) continue;
    out.push({ estimate: e, daysLeft, state: daysLeft < 0 ? "expired" : "expiring" });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}
