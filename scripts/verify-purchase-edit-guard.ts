// A purchase that has supplier returns can't have its qty/cost/tax/terms/location changed — but an edit that only
// touches notes/supplier/date must go through, even on old purchases saved before credit terms/locations existed.
// Run: npx tsx scripts/verify-purchase-edit-guard.ts
import { purchaseEditChangesReturnedFigures as g } from "../lib/purchaseEditGuard";
import type { Location, Purchase } from "../lib/types";

let fail = 0;
const check = (name: string, got: boolean, want: boolean) => {
  if (got !== want) { fail++; console.error(`FAIL ${name}: got ${got}, want ${want}`); } else console.log(`ok   ${name}`);
};
const locs = [{ id: "main", isDefault: true }, { id: "shop2", isDefault: false }] as unknown as Location[];
const legacy = { id: "p1", productId: "a", qty: 10, unitCost: 12.5, date: "2026-01-01", supplier: "S" } as unknown as Purchase;
const modern = { ...legacy, paymentMethod: "credit", creditTermDays: 30, locationId: "shop2" } as unknown as Purchase;

// What the edit form sends for an untouched legacy purchase (everything filled in, notes changed)
const formLegacy = { productId: "a", qty: 10, unitCost: 12.5, paymentMethod: "cash", locationId: "main", notes: "typo fixed", supplier: "S2" } as Partial<Purchase>;
check("legacy purchase, notes-only edit passes", g(legacy, formLegacy, locs), false);
check("float noise in all-in unit cost passes", g(legacy, { ...formLegacy, unitCost: 12.500000000001 }, locs), false);
check("qty change blocked", g(legacy, { ...formLegacy, qty: 9 }, locs), true);
check("cost change blocked", g(legacy, { ...formLegacy, unitCost: 13 }, locs), true);
check("legacy -> credit blocked", g(legacy, { ...formLegacy, paymentMethod: "credit" }, locs), true);
check("legacy -> other location blocked", g(legacy, { ...formLegacy, locationId: "shop2" }, locs), true);
check("product change blocked", g(legacy, { ...formLegacy, productId: "b" }, locs), true);
check("modern purchase, same terms passes", g(modern, { productId: "a", qty: 10, unitCost: 12.5, paymentMethod: "credit", locationId: "shop2", notes: "x" } as Partial<Purchase>, locs), false);
check("modern credit -> cash blocked", g(modern, { paymentMethod: "cash" } as Partial<Purchase>, locs), true);
check("tag-to-project only passes", g(modern, { projectId: "pr1" } as Partial<Purchase>, locs), false);
check("tax change blocked", g({ ...modern, taxAmount: 5 } as Purchase, { taxAmount: 6 } as Partial<Purchase>, locs), true);
if (fail) { console.error(`${fail} FAILED`); process.exit(1); }
console.log("all passed");
