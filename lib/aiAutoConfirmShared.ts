// The one place that defines what /api/ai/auto-confirm sends back and how the
// browser reads it. Pure (no server or React imports) so BOTH sides import it
// and scripts/verify-ai-auto-confirm.ts can round-trip it.
//
// Why this exists: the route used to send `{ results, summary }` while the
// client cast the whole body to an array and called `.filter()` on it. The
// server had already written the entries by then, so the screen showed an
// error, the proposals stayed "pending", and the next tap logged everything a
// second time. Keeping builder and parser side by side stops that drifting.

import type { CustomerCreditStatus } from "./calculations";
import { projectCreditExposure } from "./calculations";
import type { ProposedEntry } from "./aiTypes";

export interface AutoConfirmResult {
  id: string;
  success: boolean;
  error?: string;
}

export interface AutoConfirmResponse {
  results: AutoConfirmResult[];
  summary: { total: number; success: number; failed: number };
}

export function buildAutoConfirmResponse(results: AutoConfirmResult[]): AutoConfirmResponse {
  const success = results.filter((r) => r.success).length;
  return { results, summary: { total: results.length, success, failed: results.length - success } };
}

// Throws on anything that isn't a well-formed response. The message is
// deliberate: if we can't read the reply we can't know what was written, so
// the safe instruction is "look before you save again", never "try again".
export function parseAutoConfirmResponse(payload: unknown): AutoConfirmResult[] {
  const results = (payload as { results?: unknown } | null | undefined)?.results;
  if (
    !Array.isArray(results) ||
    !results.every(
      (r) => r && typeof r === "object" && typeof (r as AutoConfirmResult).id === "string" && typeof (r as AutoConfirmResult).success === "boolean"
    )
  ) {
    throw new Error(
      "Got an unexpected reply while saving. Some entries may already be logged — check Selling / Buying / Bills before saving again."
    );
  }
  return results as AutoConfirmResult[];
}

// Credit sales that would push a customer past their credit limit are not
// "saved without reviewing": they stay pending so the person sees the warning
// on the review form. Same trust level as the rest of the limit (advisory,
// enforced in the app layer). Entries for the same customer in one batch are
// counted cumulatively, so three modest sales can't slip past together.
//
// `salesTax` mirrors what the server writes (autoConfirmSale adds tax the same
// way the sale form does), so the amount compared here is what would be owed.
export function entriesNeedingCreditReview(
  entries: ProposedEntry[],
  customerCreditStatus: Map<string, CustomerCreditStatus>,
  salesTax?: { enabled?: boolean; ratePct?: number; rateFor?: (productId: string | undefined) => number | undefined }
): Map<string, string> {
  const needsReview = new Map<string, string>(); // entry id -> reason
  const acceptedByCustomer = new Map<string, number>();
  // The rate for each sale: the item's own (rateFor) when the caller can look it up, else the shop rate.
  const multiplierFor = (productId: string | undefined) =>
    salesTax?.enabled ? 1 + (salesTax.rateFor?.(productId) ?? salesTax.ratePct ?? 0) / 100 : 1;

  for (const entry of entries) {
    if (entry.kind !== "sale" || entry.paymentMethod !== "credit" || !entry.customer?.trim()) continue;
    const key = entry.customer.trim().toLowerCase();
    const status = customerCreditStatus.get(key);
    if (!status) continue; // no limit tracked for this customer
    const amount = entry.qty * entry.unitPrice * multiplierFor(entry.matchedProductId);
    const alreadyThisBatch = acceptedByCustomer.get(key) ?? 0;
    const exposure = projectCreditExposure(
      { ...status, outstanding: status.outstanding + alreadyThisBatch },
      amount
    );
    if (exposure && exposure.overBy > 0) {
      needsReview.set(entry.id, `${entry.customer.trim()} would go over their credit limit — review it first.`);
    } else {
      acceptedByCustomer.set(key, alreadyThisBatch + amount);
    }
  }
  return needsReview;
}
