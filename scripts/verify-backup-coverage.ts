// Fails when the app starts keeping a collection (or a meta document) that the
// full backup does not carry, so "your data is safe" can't quietly rot as
// features are added. Budgets were once missed exactly this way.
// Run: npx tsx scripts/verify-backup-coverage.ts
import { readFileSync } from "fs";
import { join } from "path";
import { buildBackupPayload } from "../lib/backupPayload";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}

const src = readFileSync(join(__dirname, "../contexts/DataContext.tsx"), "utf8");

const collections = new Set<string>();
for (const m of src.matchAll(/collection\(db,\s*"users",\s*(?:businessId|bizId),\s*"([A-Za-z]+)"\)/g)) collections.add(m[1]);
const metaDocs = new Set<string>();
for (const m of src.matchAll(/doc\(db,\s*"users",\s*(?:businessId|bizId),\s*"meta",\s*"([A-Za-z]+)"\)/g)) metaDocs.add(m[1]);

// Deliberately NOT in the backup, each with the reason it is safe to omit.
const EXCLUDED_COLLECTIONS: Record<string, string> = {
  members: "tied to sign-in accounts — re-invite people",
  invites: "tied to sign-in accounts — re-invite people",
  catalog: "cost-stripped mirror of products for Staff; the app rebuilds it",
};

// Ask the real payload builder what it carries. A Proxy answers every field
// with an empty array, so this exercises the actual mapping, not a copy of it.
const payload = buildBackupPayload(new Proxy({}, { get: () => [] }) as any);
const backedUp = new Set<string>([
  ...Object.keys(payload).filter((k) => !["settings", "budgets", "invoiceCounter", "extra"].includes(k)),
  ...Object.keys(payload.extra ?? {}),
]);

assert(collections.size > 25, `found ${collections.size} collections in DataContext (the scan is really reading it)`);
assert(collections.has("sales") && collections.has("products"), "scan sanity: sales and products were found");

for (const name of [...collections].sort()) {
  if (EXCLUDED_COLLECTIONS[name]) {
    console.log(`SKIP: ${name} is excluded on purpose (${EXCLUDED_COLLECTIONS[name]})`);
  } else {
    assert(backedUp.has(name), `${name}: is included in full-backup.json`);
  }
}

// Meta documents: settings and budgets are the business's own data.
assert(metaDocs.has("settings") && metaDocs.has("budgets"), "scan sanity: settings and budgets meta docs were found");
assert("settings" in payload, "meta/settings is in the backup");
assert("budgets" in payload, "meta/budgets (monthly targets) is in the backup");
assert("invoiceCounter" in payload, "meta/invoiceCounter (tax-invoice counter) is in the backup");
// Meta documents that are derived, not business data: not backed up on purpose, with the reason.
const EXCLUDED_META: Record<string, string> = {
  healthSnapshot: "a derived daily summary for the operator's account list; rebuilt by the app, holds nothing that is not already in the books",
};
for (const name of [...metaDocs]) {
  if (EXCLUDED_META[name]) {
    console.log(`SKIP: meta/${name} is excluded on purpose (${EXCLUDED_META[name]})`);
  } else if (!["settings", "budgets", "invoiceCounter"].includes(name)) {
    assert(false, `meta/${name} is subscribed to but neither backed up nor listed as excluded — decide which`);
  }
}

// The restore script must accept every collection the backup writes.
const restore = readFileSync(join(__dirname, "restore-from-backup.mjs"), "utf8");
const allowed = new Set([...restore.slice(restore.indexOf("const ALLOWED")).split("]);")[0].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]));
for (const name of [...backedUp].sort()) {
  assert(allowed.has(name), `restore script will restore "${name}" (not skip it as unknown)`);
}
assert(/meta"\)\.doc\("budgets"\)/.test(restore), "restore script restores meta/budgets");

if (process.exitCode !== 1) console.log("\nALL CHECKS PASSED");
