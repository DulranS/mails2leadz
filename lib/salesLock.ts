// Issued sales lock (Settings > Issued sales). When on, a sale cannot be edited or deleted; only its project and its note can
// change. A mistake is corrected by a return or a credit, so the original and the correction both stay on the record.
// Enforced twice on purpose: DataContext (what the app does) and firestore.rules (what the server accepts). Pure.
export const LOCKED_SALE_EDITABLE_FIELDS: readonly string[] = ["projectId", "notes"];

export const SALES_LOCKED_MESSAGE =
  "This sale is locked (Settings > Issued sales). To correct it, record a return or a credit, so the sale and the correction both stay on record.";

export function lockedSaleEditAllowed(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).every((k) => LOCKED_SALE_EDITABLE_FIELDS.includes(k));
}
