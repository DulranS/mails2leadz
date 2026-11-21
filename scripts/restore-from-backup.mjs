// OPERATOR TOOL — restores a business from the full-backup.json inside a
// backup zip that the owner downloaded from Import / export.
//
// Safe by default:
//   - DRY RUN unless you pass --apply (prints what it would do, touches nothing,
//     needs no credentials).
//   - Never overwrites: a document that already exists is skipped, so running
//     this against a business that still has its data can't damage it. Pass
//     --overwrite only when you deliberately want the backup to win.
//   - Documents keep their original ids, so links between records (a payment
//     pointing at its sale) survive the round trip.
//
// Usage:
//   node scripts/restore-from-backup.mjs <full-backup.json> <businessId>            (dry run)
//   node scripts/restore-from-backup.mjs <full-backup.json> <businessId> --apply
//   node scripts/restore-from-backup.mjs <full-backup.json> <businessId> --apply --overwrite
//
// <businessId> is the owner's Firebase Auth uid (Firebase console ->
// Authentication -> Users). Unzip the backup first to get full-backup.json.
//
// Credentials (--apply only): scripts/serviceAccountKey.json, or the
// FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY env vars.
// Never commit or share either — see scripts/serviceAccountKey.json.README.txt.
//
// Not restored: team members/invites (re-invite people — their access is
// tied to sign-in accounts, not to business data) and the catalog mirror
// (the app rebuilds it from products).

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [file, businessId] = args.filter((a) => !a.startsWith("--"));
const APPLY = flags.has("--apply");
const OVERWRITE = flags.has("--overwrite");

if (!file || !businessId) {
  console.error("Usage: node scripts/restore-from-backup.mjs <full-backup.json> <businessId> [--apply] [--overwrite]");
  process.exit(1);
}

const backup = JSON.parse(readFileSync(file, "utf8"));
if (backup.format !== "balancr-full-backup" || backup.version !== 1 || typeof backup.collections !== "object") {
  console.error("That file isn't a Balancr full-backup.json (format/version mismatch).");
  process.exit(1);
}

// Only ever write into these — a backup file can't be used to sneak data into
// members/invites/meta/account (billing + suspension) or anywhere else.
const ALLOWED = new Set([
  "products", "purchases", "sales", "expenses", "variableCosts", "capitalEntries", "taxPayments",
  "purchaseOrders", "employees", "loans", "contingencies", "dataRequests", "customers", "projects", "timeEntries", "opportunities",
  "fixedAssets", "receivablePayments", "receivableWriteOffs", "payablePayments", "billPayments",
  "saleReturns", "supplierReturns", "discounts", "cashCounts", "tillPayouts", "stockAdjustments", "stockOuts", "playbook", "leaveRecords", "supportCases", "feedback", "tasks", "bookings", "events", "cheques", "mileage", "requests", "procedures", "compliance", "incidents", "maintenance", "kpis", "reviews", "risks", "qualityChecks", "businessLog", "webOrders", "priceHistory", "accruals", "candidates", "obligations", "orgLinks", "improvements", "supplierAlternatives", "contracts", "sustainabilityEntries", "recurringInvoiceRuns", "memberships", "farmBatches", "tabs", "shifts", "shipments", "rentals", "consignments", "workOrders", "businessRecords", "supplierCredits", "customerDeposits", "reviewMarks", "suppliers", "estimates", "leads",
  "recurringInvoices", "recurringExpenseTemplates", "recurringExpenseOccurrences",
  "projectCostSegments", "projectMilestones", "bankStatementLines", "journalEntries", "auditLog",
  "locations", "stockTransfers", "openingBalances", "securities", "investmentTxns",
  "lentLoans", "lentLoanTxns", "collectionNotes",
]);

const plan = [];
for (const [name, rows] of Object.entries(backup.collections)) {
  if (!ALLOWED.has(name)) {
    console.warn(`Skipping unknown collection "${name}".`);
    continue;
  }
  if (!Array.isArray(rows)) continue;
  const usable = rows.filter((r) => r && typeof r.id === "string" && r.id.length > 0 && !r.id.includes("/"));
  if (usable.length !== rows.length) console.warn(`${name}: ${rows.length - usable.length} row(s) without a usable id will be skipped.`);
  plan.push({ name, rows: usable });
}

console.log(`Backup from ${backup.exportedAt} — business "${backup.settings?.businessName ?? "(unnamed)"}"`);
for (const { name, rows } of plan) console.log(`  ${name.padEnd(28)} ${rows.length}`);
if (backup.budgets && typeof backup.budgets === "object") {
  console.log(`  ${"budgets (monthly targets)".padEnd(28)} ${Object.keys(backup.budgets).length} month(s)`);
}

if (!APPLY) {
  console.log("\nDRY RUN — nothing written. Re-run with --apply to restore into business", businessId);
  process.exit(0);
}

const { initializeApp, cert } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");

const here = dirname(fileURLToPath(import.meta.url));
const keyPath = join(here, "serviceAccountKey.json");
if (existsSync(keyPath)) {
  initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, "utf8"))) });
} else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
} else {
  console.error("No credentials: add scripts/serviceAccountKey.json or set FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.");
  process.exit(1);
}

const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
const root = db.collection("users").doc(businessId);

// Refuse to restore into something that isn't an existing business.
const pointer = await db.collection("memberships").doc(businessId).get();
if (!pointer.exists) {
  console.error(`No business found for id ${businessId} (no memberships/${businessId} pointer). Check the uid.`);
  process.exit(1);
}

let written = 0, skipped = 0;
for (const { name, rows } of plan) {
  const col = root.collection(name);
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const refs = chunk.map((r) => col.doc(r.id));
    const existing = OVERWRITE ? [] : await db.getAll(...refs);
    const batch = db.batch();
    chunk.forEach((row, j) => {
      if (!OVERWRITE && existing[j].exists) {
        skipped++;
        return;
      }
      const { id, ...fields } = row;
      batch.set(refs[j], fields);
      written++;
    });
    await batch.commit();
  }
  console.log(`  ${name}: done`);
}

// Settings only fill in when there are none yet, unless --overwrite.
if (backup.settings) {
  const sref = root.collection("meta").doc("settings");
  const snap = await sref.get();
  if (!snap.exists || OVERWRITE) {
    await sref.set(backup.settings);
    console.log("  settings: restored");
  } else {
    console.log("  settings: already present, left as is");
  }
}

// Monthly budget targets are a single meta document, restored on the same
// terms as settings: only fill in when there are none yet, unless --overwrite.
if (backup.budgets && typeof backup.budgets === "object" && Object.keys(backup.budgets).length > 0) {
  const bref = root.collection("meta").doc("budgets");
  const snap = await bref.get();
  if (!snap.exists || OVERWRITE) {
    await bref.set(backup.budgets);
    console.log(`  budgets: restored (${Object.keys(backup.budgets).length} month(s))`);
  } else {
    console.log("  budgets: already present, left as is");
  }
}

// The tax-invoice counter (v326) is one meta document. It is restored only when it would move the counter forward, so a restore never lets numbers repeat.
if (backup.invoiceCounter && Number.isInteger(backup.invoiceCounter.last) && backup.invoiceCounter.last > 0) {
  const cref = root.collection("meta").doc("invoiceCounter");
  const snap = await cref.get();
  const current = snap.exists && typeof snap.data().last === "number" ? snap.data().last : 0;
  if (OVERWRITE || backup.invoiceCounter.last > current) {
    await cref.set({ last: backup.invoiceCounter.last });
    console.log(`  invoice counter: restored (last number ${backup.invoiceCounter.last})`);
  } else {
    console.log("  invoice counter: already at or past the backup, left as is");
  }
}

console.log(`\nRestored ${written} document(s); skipped ${skipped} that already existed.`);
