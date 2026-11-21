// Firestore rules smoke test: who can READ what, and what is always denied. Reads and denials only, so a
// failure means the RULES disagree with the role matrix at the top of firestore.rules, not that a test payload
// was malformed. Needs Java (the emulator is a Java program) and ONE extra package that is deliberately not in
// package.json (so the app build never depends on it):
//
//   npm i --no-save @firebase/rules-unit-testing
//   npx firebase-tools emulators:exec --only firestore --project demo-balancr "node scripts/rules-smoke.mjs"
//
// STATUS: written in an environment that could not download the emulator, so this has NOT been run. If a check
// fails, read the line before concluding the rules are wrong: it names the path and who tried it.
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

const env = await initializeTestEnvironment({ projectId: "demo-balancr", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
let failed = 0, total = 0;
async function check(label, promise) {
  total++;
  try { await promise; console.log("ok   ", label); } catch (e) { failed++; console.error("FAIL ", label, "-", String(e.message ?? e).split("\n")[0]); }
}

// Seed bypassing rules: business "bizA" with one of each role, business "bizB" with its own owner.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const put = (path, data) => setDoc(doc(db, path), data);
  for (const [uid, role] of [["bizA", "owner"], ["mgr", "manager"], ["stf", "staff"], ["acc", "accountant"]]) {
    await put(`users/bizA/members/${uid}`, { role, active: true, email: `${uid}@x.test` });
  }
  await put("users/bizB/members/bizB", { role: "owner", active: true });
  await put("users/bizA/products/p1", { name: "Item", costPrice: 5 });
  await put("users/bizA/purchases/pu1", { productId: "p1", qty: 1, unitCost: 5, expiryDate: "2027-01-01", batchRef: "L1" });
  await put("users/bizA/sales/s_stf", { productId: "p1", qty: 1, createdByUid: "stf" });
  await put("users/bizA/sales/s_owner", { productId: "p1", qty: 1, createdByUid: "bizA" });
  await put("users/bizA/catalog/c1", { name: "Item", price: 9 });
  await put("users/bizA/meta/lifecycle", { sent: {} });
  await put("platform/automation", { lastRunAt: 1 });
  await put("platform/cronGate", { claimedAt: 1 });
  await put("platform/publicEmailBudget", { day: "2026-01-01" });
});

const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
const read = (db, path) => getDoc(doc(db, path));

// Not signed in, or someone else's business: nothing.
for (const p of ["products/p1", "purchases/pu1", "sales/s_owner", "catalog/c1", "members/bizA"]) {
  await check(`signed-out cannot read users/bizA/${p}`, assertFails(read(as(null), `users/bizA/${p}`)));
  await check(`another business's owner cannot read users/bizA/${p}`, assertFails(read(as("bizB"), `users/bizA/${p}`)));
}

// Owner and manager read the books; the accountant reads them too but can write nothing.
for (const uid of ["bizA", "mgr", "acc"]) {
  for (const p of ["products/p1", "purchases/pu1", "sales/s_owner"]) await check(`${uid} can read users/bizA/${p}`, assertSucceeds(read(as(uid), `users/bizA/${p}`)));
}
await check("accountant cannot create a sale", assertFails(setDoc(doc(as("acc"), "users/bizA/sales/new1"), { productId: "p1", qty: 1, createdByUid: "acc" })));
await check("accountant cannot edit a product", assertFails(setDoc(doc(as("acc"), "users/bizA/products/p1"), { name: "Hacked" })));
await check("accountant cannot edit a purchase", assertFails(setDoc(doc(as("acc"), "users/bizA/purchases/pu1"), { qty: 99 })));

// The daily health summary (v79): the owner writes and reads it; nobody else does.
const HEALTH = { asOf: "2026-10-20", overdueTotal: 0, overdueCount: 0, totalOutstanding: 0, runwayMonths: null, lastMonth: null, lastMonthNetProfit: null };
await check("owner can write the health summary", assertSucceeds(setDoc(doc(as("bizA"), "users/bizA/meta/healthSnapshot"), HEALTH)));
await check("owner can read the health summary", assertSucceeds(read(as("bizA"), "users/bizA/meta/healthSnapshot")));
for (const uid of ["mgr", "stf", "acc", "bizB"]) {
  await check(`${uid} cannot write the health summary`, assertFails(setDoc(doc(as(uid), "users/bizA/meta/healthSnapshot"), HEALTH)));
  await check(`${uid} cannot read the health summary`, assertFails(read(as(uid), "users/bizA/meta/healthSnapshot")));
}

// Several businesses on one login (v80): a bookmark can only be made to a business where the person is an active member,
// only the person reads their own list, and links are never edited. (Access itself is still the member record.)
await check("an active member can bookmark their business", assertSucceeds(setDoc(doc(as("mgr"), "memberships/mgr/linked/bizA"), { linkedAt: 1 })));
await check("a person cannot bookmark a business they are not a member of", assertFails(setDoc(doc(as("mgr"), "memberships/mgr/linked/bizB"), { linkedAt: 1 })));
await check("nobody else can read someone's list of businesses", assertFails(read(as("stf"), "memberships/mgr/linked/bizA")));
await check("the person can read their own list", assertSucceeds(read(as("mgr"), "memberships/mgr/linked/bizA")));
await check("a bookmark cannot be edited", assertFails(setDoc(doc(as("mgr"), "memberships/mgr/linked/bizA"), { linkedAt: 2 })));

// Staff: the cost-stripped catalog and their own sales only. No cost data.
await check("staff can read the catalog", assertSucceeds(read(as("stf"), "users/bizA/catalog/c1")));
await check("staff can read a sale they made", assertSucceeds(read(as("stf"), "users/bizA/sales/s_stf")));
await check("staff cannot read someone else's sale", assertFails(read(as("stf"), "users/bizA/sales/s_owner")));
await check("staff cannot read products (cost data)", assertFails(read(as("stf"), "users/bizA/products/p1")));
await check("staff cannot read purchases (cost + expiry data)", assertFails(read(as("stf"), "users/bizA/purchases/pu1")));

// Server-only documents: closed to every signed-in role, owner included, for reads and writes.
for (const uid of ["bizA", "mgr", "stf", "acc"]) {
  await check(`${uid} cannot read platform/automation`, assertFails(read(as(uid), "platform/automation")));
  await check(`${uid} cannot write platform/cronGate`, assertFails(setDoc(doc(as(uid), "platform/cronGate"), { claimedAt: 0 })));
  await check(`${uid} cannot write platform/publicEmailBudget`, assertFails(setDoc(doc(as(uid), "platform/publicEmailBudget"), { confirm: 0 })));
}
await check("owner cannot read users/bizA/meta/lifecycle", assertFails(read(as("bizA"), "users/bizA/meta/lifecycle")));
await check("owner cannot write users/bizA/meta/lifecycle", assertFails(setDoc(doc(as("bizA"), "users/bizA/meta/lifecycle"), { sent: { forged: 1 } })));

await env.cleanup();
console.log(failed === 0 ? `\nOK: ${total} checks` : `\n${failed} of ${total} checks FAILED`);
process.exit(failed === 0 ? 0 : 1);
