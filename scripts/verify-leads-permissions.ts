// Verifies the permission split the Leads feature relies on: Staff can log
// a new lead (create:sale) but cannot move it through stages or delete it
// (manage:sales / delete:sales, Owner/Manager only) — the same split
// app/leads/page.tsx and firestore.rules' /leads block both assume.
//
// Run: npx tsx scripts/verify-leads-permissions.ts

import { can } from "../lib/permissions";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

// canCreate = manage:sales || create:sale (app/leads/page.tsx's own logic)
function canCreateLead(role: "owner" | "manager" | "staff") {
  return can(role, "manage:sales") || can(role, "create:sale");
}

assert(canCreateLead("owner"), "owner can create a lead");
assert(canCreateLead("manager"), "manager can create a lead");
assert(canCreateLead("staff"), "staff can create a lead (they're usually the one doing outreach)");

assert(can("owner", "manage:sales"), "owner can move a lead through stages / edit it");
assert(can("manager", "manage:sales"), "manager can move a lead through stages / edit it");
assert(!can("staff", "manage:sales"), "staff CANNOT move a lead through stages / edit it — matches firestore.rules' update rule");

assert(can("owner", "delete:sales"), "owner can delete a lead (app-level policy, DataContext.deleteLead)");
// Manager deliberately does NOT get delete:sales at the app-permission
// layer — same as deleteSale/deleteEstimate already do — even though
// firestore.rules' /leads block (mirroring /sales and /estimates exactly)
// grants Owner-OR-Manager at the database layer. That's an intentional
// two-layer design already used throughout this app: the rule is the
// outer security boundary (Owner or Manager may touch the document at
// all), and delete:sales is a stricter app-policy gate on top of it,
// enforced by DataContext before Firestore is ever called, that further
// narrows actual deletion to Owner alone — not a bug for Leads to "fix"
// on its own, since doing so would make Leads inconsistent with every
// other sales-related collection instead of matching them.
assert(!can("manager", "delete:sales"), "manager does NOT get delete:sales at the app-policy layer (same as sales/estimates already)");
assert(!can("staff", "delete:sales"), "staff CANNOT delete a lead — matches firestore.rules' delete rule");

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
