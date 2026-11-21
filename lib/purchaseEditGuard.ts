// Does an edit to a purchase move any figure that a supplier return was built on?
// Compares what the figures MEAN, not how they happen to be stored: a purchase from before credit terms existed
// has no paymentMethod (= cash) and one from before locations has no locationId (= the default location), while the
// edit form always sends both filled in. Money values use a tiny tolerance because the form recomputes the all-in
// unit cost from its parts. Pure, so scripts/verify-purchase-edit-guard.ts can run it.
import type { Location, Purchase } from "./types";
import { resolveLocationId } from "./stockTracking";

export function purchaseEditChangesReturnedFigures(
  before: Purchase,
  patch: Partial<Purchase>,
  locations: Location[]
): boolean {
  const newer = patch as Record<string, unknown>;
  const older = before as unknown as Record<string, unknown>;
  const numChanged = (k: string) =>
    k in newer &&
    Math.abs(Number(newer[k] ?? 0) - Number(older[k] ?? 0)) > 1e-6 * Math.max(1, Math.abs(Number(older[k] ?? 0)));
  return (
    numChanged("qty") ||
    numChanged("unitCost") ||
    numChanged("taxAmount") ||
    ("productId" in newer && newer.productId !== older.productId) ||
    ("paymentMethod" in newer && (newer.paymentMethod ?? "cash") !== (older.paymentMethod ?? "cash")) ||
    ("locationId" in newer &&
      resolveLocationId(newer.locationId as string | undefined, locations) !==
        resolveLocationId(older.locationId as string | undefined, locations))
  );
}
