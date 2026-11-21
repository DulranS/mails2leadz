// AI-facing growth/scaling risk signal: how concentrated revenue and
// purchasing are on a single channel. This is the classic thing that hurts
// a scaling SME — losing your one big customer or your one supplier — and
// the numbers already exist (computeCustomerConcentration /
// computeSupplierConcentration back the Sales and Purchases pages), but
// until now the only way to see them was to scroll to the top of those two
// specific pages. This wrapper just gives the Assistant the same numbers,
// with the same severity bands the UI already uses, so "how exposed am I to
// one customer/supplier?" can be answered in conversation instead of only
// by knowing which page to visit.
import type { Sale, Purchase } from "./types";
import { computeCustomerConcentration, computeSupplierConcentration } from "./calculations";

export type ConcentrationSeverity = "low" | "medium" | "high";

export interface ConcentrationRiskReport {
  trailingMonths: number;
  customer: {
    topCustomer: string | null;
    topCustomerSharePct: number | null; // null when there's no named-customer sales history yet
    top3SharePct: number | null;
    severity: ConcentrationSeverity | null;
  };
  supplier: {
    topSupplier: string | null;
    topSupplierSharePct: number | null; // null when there's no purchase history yet
    top3SharePct: number | null;
    severity: ConcentrationSeverity | null;
  };
}

// Same 60% / 35% bands Sales/Purchases already color-code (Badge tone "bad"
// / "amber" / "good") — kept in one place so the Assistant's read of "risky"
// never disagrees with what the page itself shows.
function severityFor(sharePct: number | null): ConcentrationSeverity | null {
  if (sharePct === null) return null;
  if (sharePct >= 60) return "high";
  if (sharePct >= 35) return "medium";
  return "low";
}

export function generateConcentrationRiskReport(sales: Sale[], purchases: Purchase[], windowMonths = 12): ConcentrationRiskReport {
  const customerConcentration = computeCustomerConcentration(sales, windowMonths);
  const supplierConcentration = computeSupplierConcentration(purchases, windowMonths);
  return {
    trailingMonths: windowMonths,
    customer: {
      topCustomer: customerConcentration.customers[0]?.customer ?? null,
      topCustomerSharePct: customerConcentration.topCustomerSharePct,
      top3SharePct: customerConcentration.top3SharePct,
      severity: severityFor(customerConcentration.topCustomerSharePct),
    },
    supplier: {
      topSupplier: supplierConcentration.suppliers[0]?.supplier ?? null,
      topSupplierSharePct: supplierConcentration.topSupplierSharePct,
      top3SharePct: supplierConcentration.top3SharePct,
      severity: severityFor(supplierConcentration.topSupplierSharePct),
    },
  };
}
