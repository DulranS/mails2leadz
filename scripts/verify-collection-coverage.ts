// Static check that nothing the app writes can fail silently in production for want of a line somewhere:
//   1. every Firestore collection the client reads or writes has a block in firestore.rules (a missing block is a
//      permission-denied nobody sees until a customer hits it);
//   2. every collection in the backup file is one scripts/restore-from-backup.mjs will actually restore (a
//      collection that is backed up but not restorable is a backup that lies);
//   3. the collections added in v54 (stockOuts, supplierCredits) keep the trust line of the records they sit beside.
// Run: npx tsx scripts/verify-collection-coverage.ts
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("OK:", msg); } else { fail++; console.error("FAIL:", msg); process.exitCode = 1; }
}

const root = join(__dirname, "..");
const rules = readFileSync(join(root, "firestore.rules"), "utf8");
// `match /name/{id}` (a collection) and `match /name/doc` (a single fixed document, like meta/settings).
const ruleNames = new Set([...rules.matchAll(/match \/([A-Za-z0-9_]+)\/(?:\{|[A-Za-z0-9_]+\s*\{)/g)].map((m) => m[1]));

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === ".next" || f.startsWith(".")) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}
const clientFiles = ["app", "components", "contexts", "lib", "hooks"].flatMap((d) => walk(join(root, d)));
const used = new Set<string>();
for (const f of clientFiles) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/"users",\s*[A-Za-z_.]+,\s*"([A-Za-z0-9_]+)"/g)) used.add(m[1]);
}
for (const m of readFileSync(join(root, "contexts/DataContext.tsx"), "utf8").matchAll(/(?:chunkedBatchAdd\(|col:\s*)"([A-Za-z0-9_]+)"/g)) used.add(m[1]);

const missing = [...used].filter((n) => !ruleNames.has(n));
assert(used.size > 40, `scanned the client and found ${used.size} collections in use`);
assert(missing.length === 0, `every collection the client touches has a rules block${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);

// Backup <-> restore.
const payload = readFileSync(join(root, "lib/backupPayload.ts"), "utf8");
const extraKeys = [...payload.matchAll(/^\s{6}([A-Za-z0-9_]+):\s*data\.[A-Za-z0-9_]+,/gm)].map((m) => m[1]);
const restore = readFileSync(join(root, "scripts/restore-from-backup.mjs"), "utf8");
const notRestorable = extraKeys.filter((k) => !new RegExp(`"${k}"`).test(restore));
assert(extraKeys.length > 15, `found ${extraKeys.length} extra collections in the backup payload`);
assert(notRestorable.length === 0, `every backed-up collection is restorable${notRestorable.length ? ` (not restorable: ${notRestorable.join(", ")})` : ""}`);
assert(extraKeys.includes("stockOuts") && extraKeys.includes("supplierCredits"), "the two new collections are in the backup");
assert(extraKeys.includes("customerDeposits"), "customerDeposits is in the backup");

// Trust line of the new collections.
function block(name: string): string {
  const i = rules.indexOf(`match /${name}/{`);
  if (i < 0) return "";
  let depth = 0;
  // Skip the {docId} wildcard, then walk the braces of the block body itself.
  const bodyStart = rules.indexOf("{", rules.indexOf("}", i));
  for (let k = bodyStart; k < rules.length; k++) {
    if (rules[k] === "{") depth++;
    if (rules[k] === "}") { depth--; if (depth === 0) return rules.slice(i, k + 1); }
  }
  return "";
}
for (const name of ["stockOuts", "supplierCredits"]) {
  const b = block(name);
  assert(/allow read:\s*if canReadBooks\(businessId\)/.test(b), `${name}: readable by whoever can read the books`);
  assert(/allow create, update:\s*if isOwnerOrManager\(businessId\)/.test(b), `${name}: only Owner/Manager create or edit (staff and accountants cannot)`);
  assert(/allow delete:\s*if isOwner\(businessId\)\s*&&\s*!isPublicDemo\(businessId\)/.test(b), `${name}: only the Owner deletes, never in the public demo`);
}
// Customer deposits: Owner/Manager create and edit. The one staff exception is selling a gift card at the counter: a received
// entry carrying a card code, made by that person. Nothing else (no reads of balances, no applying, refunding or editing).
{
  const b = block("customerDeposits");
  assert(/allow read:\s*if canReadBooks\(businessId\)/.test(b), "customerDeposits: readable by whoever can read the books");
  assert(/allow create:\s*if isOwnerOrManager\(businessId\)\s*\|\|\s*\(isStaff\(businessId\)/.test(b), "customerDeposits: Owner/Manager create; staff may only create");
  assert(/request\.resource\.data\.kind == "received"/.test(b) && /request\.resource\.data\.giftCardCode is string/.test(b) && /createdByUid == request\.auth\.uid/.test(b), "customerDeposits: staff create only a gift card sale of their own");
  assert(/allow update:\s*if isOwnerOrManager\(businessId\);/.test(b), "customerDeposits: only Owner/Manager edit");
  assert(/allow delete:\s*if isOwner\(businessId\)\s*&&\s*!isPublicDemo\(businessId\)/.test(b), "customerDeposits: only the Owner deletes, never in the public demo");
}
// The collections diary: readable by whoever reads the books, written only by Owner/Manager as themselves, never
// edited, deleted only by the Owner (never in the public demo). Staff never reach it.
{
  const b = block("collectionNotes");
  assert(/allow read:\s*if canReadBooks\(businessId\)/.test(b), "collectionNotes: readable by whoever can read the books");
  assert(/allow create:\s*if isOwnerOrManager\(businessId\)\s*&&\s*createdBySelf\(\)/.test(b), "collectionNotes: only Owner/Manager create, and only as themselves");
  assert(/allow update:\s*if false/.test(b), "collectionNotes: a diary line is never edited");
  assert(/allow delete:\s*if isOwner\(businessId\)\s*&&\s*!isPublicDemo\(businessId\)/.test(b), "collectionNotes: only the Owner deletes, never in the public demo");
  assert(!/isStaff|isOwnerOrActiveMember|isOwnerOrOperatingMember/.test(b), "collectionNotes: no rule lets Staff in");
  assert(extraKeys.includes("collectionNotes"), "collectionNotes is in the backup");
}
// Who may choose a customer's collector: the Owner. A Manager edits the rest of the record; Staff can't create one with a collector.
{
  const b = block("customers");
  assert(/diff\(resource\.data\)\.affectedKeys\(\)\.hasAny\(\['collectorUid', 'collectorName'\]\)/.test(b), "customers: changing the collector is refused for a Manager");
  assert(/hasAny\(\['creditLimit', 'cac', 'collectorUid', 'collectorName'\]\)/.test(b), "customers: Staff can't create a customer with a collector, credit limit or CAC");
}
assert(/match \/catalog\/\{docId\}[\s\S]{0,400}allow write:\s*if isOwnerOrManager/.test(rules), "the staff catalogue (which now carries pack sizes) is still written only by Owner/Manager");

console.log(`\n${pass} passed, ${fail} failed`);
