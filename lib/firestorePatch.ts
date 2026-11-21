import { deleteField } from "firebase/firestore";

// Firestore is initialised with ignoreUndefinedProperties (lib/firebase.ts), so
// `updateDoc(ref, { phone: undefined })` does NOT clear the phone — the field is
// silently skipped and the old value stays, while the screen says "saved".
// For edit forms that send every field, an `undefined` means "the person
// emptied this box", so turn it into a real delete.
//
// Only use this where the caller always sends the complete form. A partial
// patch that leaves keys out is unaffected (missing keys are never touched),
// but one that passes `undefined` meaning "leave alone" would erase data.
export function clearUndefinedFields<T extends Record<string, unknown>>(patch: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = value === undefined ? deleteField() : value;
  }
  return out;
}

// For forms that send most fields but where some keys are legitimately left out of a partial patch (so a blanket
// clearUndefinedFields would be unsafe): only the NAMED keys, and only when the caller put the key in the patch
// with the value `undefined`, become a real delete. Everything else is passed through untouched.
export function clearListedUndefined<T extends Record<string, unknown>>(patch: T, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...patch };
  for (const key of keys) {
    if (key in patch && patch[key] === undefined) out[key] = deleteField();
  }
  return out;
}

// Optional Expense fields the Expenses form sends as `undefined` when the person empties or unticks them. Without
// turning those into real deletes, removing an end date ("make it ongoing") or unticking reclaimable tax would
// save "successfully" and leave the old value in place, so the cost kept stopping on the old date, or the old tax
// kept being reclaimed. A one-off bill turned into a recurring cost also kept its stale "unpaid" status.
export const EXPENSE_CLEARABLE_FIELDS = ["projectId", "locationId", "endDate", "taxAmount", "payee", "paymentStatus", "dueDate", "importance", "channel"] as const;

// Optional Product fields the product form sends as `undefined` when the person empties them: the unit label, the
// pack sizes, the "sold in parts" switch, and the variant grouping. Without a real delete, removing a pack would
// "save" and the purchase forms would keep offering it.
export const PRODUCT_CLEARABLE_FIELDS = ["baseUnit", "packSizes", "variantGroup", "variantLabel", "wholesalePrice", "priceTiers", "warrantyMonths", "taxRatePct", "ecoTags", "binLocation", "mapPrice", "condition"] as const;
