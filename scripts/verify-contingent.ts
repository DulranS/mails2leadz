// Contingent liabilities and commitments (lib/contingent.ts, v329). Run: tsx scripts/verify-contingent.ts
import { readFileSync } from "node:fs";
import {
  sanitizeContingency,
  openContingencyTotal,
  openContingencies,
  CONTINGENCY_KINDS,
  CONTINGENCY_KIND_LABELS,
} from "../lib/contingent";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failed++;
  console.log(`${cond ? "OK" : "FAIL"}: ${label}`);
};

const TODAY = "2026-11-20";
const base = { description: "Bank guarantee for the shop lease", kind: "guarantee", amount: 250000, date: "2026-10-01" };

const good = sanitizeContingency(base, { today: TODAY });
ok(good !== null && good.description === base.description && good.amount === 250000, "a valid item is kept");
ok(good?.status === "open", "a new item is always open, even if the input says settled");
ok(sanitizeContingency({ ...base, status: "settled" } as never, { today: TODAY })?.status === "open", "status cannot be set to settled on create");
ok(good?.date === "2026-10-01", "the date given is kept");
ok(sanitizeContingency({ ...base, date: "" }, { today: TODAY })?.date === TODAY, "no date falls back to today");
ok(sanitizeContingency({ ...base, date: "1 Oct 2026" }, { today: TODAY })?.date === TODAY, "a date in the wrong format falls back to today");

ok(sanitizeContingency({ ...base, description: "   " }, { today: TODAY }) === null, "no description is refused");
ok(sanitizeContingency({ ...base, amount: 0 }, { today: TODAY }) === null, "a zero amount is refused");
ok(sanitizeContingency({ ...base, amount: -5 }, { today: TODAY }) === null, "a negative amount is refused");
ok(sanitizeContingency({ ...base, amount: "abc" }, { today: TODAY }) === null, "a non-number amount is refused");
ok(sanitizeContingency({ ...base, amount: NaN }, { today: TODAY }) === null, "NaN is refused");

ok(sanitizeContingency({ ...base, amount: 1234.567 }, { today: TODAY })?.amount === 1234.57, "the amount is rounded to the cent");
ok(sanitizeContingency({ ...base, kind: "bribe" }, { today: TODAY })?.kind === "other", "an unknown kind becomes other");
ok(CONTINGENCY_KINDS.every((k) => CONTINGENCY_KIND_LABELS[k]), "every kind has a label");

const dirty = sanitizeContingency({ ...base, description: "Claim\u0007 by\n\n  supplier", note: "x".repeat(900), counterparty: "  Landlord  " }, { today: TODAY });
ok(dirty?.description === "Claim by supplier", "control characters and runs of spaces are removed from the description");
ok((dirty?.note ?? "").length === 500, "the note is capped at 500 characters");
ok(dirty?.counterparty === "Landlord", "the other party is trimmed");
ok(!("counterparty" in (sanitizeContingency({ ...base, counterparty: "  " }, { today: TODAY }) ?? {})), "an empty other party is not stored");

ok(sanitizeContingency({ ...base, description: "d".repeat(400) }, { today: TODAY })?.description.length === 300, "the description is capped at 300 characters");

const items = [
  { amount: 250000, status: "open" as const },
  { amount: 80000.1, status: "open" as const },
  { amount: 999999, status: "settled" as const },
  { amount: NaN, status: "open" as const },
  { amount: -10, status: "open" as const },
];
ok(openContingencyTotal(items) === 330000.1, "the open total leaves out settled items and unusable amounts");
ok(openContingencyTotal([]) === 0, "an empty list totals zero");
ok(openContingencyTotal(undefined) === 0, "a missing list totals zero");
ok(openContingencies([{ amount: 80000, status: "open" as const }, { amount: 250000, status: "open" as const }, { amount: 999, status: "settled" as const }]).map((c) => c.amount).join(",") === "250000,80000", "open items are listed largest first, settled items left out");

// Wiring: the balance sheet shows the memo, the data layer and rules hold the collection with the same trust line as loans
const page = readFileSync(new URL("../app/statements/page.tsx", import.meta.url), "utf8");
ok(page.includes("function ContingentMemo("), "the statements page has the contingent memo card");
ok(page.includes("<ContingentMemo"), "the memo card is rendered on the balance sheet");
ok(page.includes("not in totals"), "the memo card says it is not in totals");
ok(page.includes("from \"@/lib/contingent\""), "the statements page imports the contingent rules");
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const block = rules.slice(rules.indexOf("match /contingencies/{docId}"));
ok(block.length > 0 && block.slice(0, 300).includes("allow read: if canReadBooks(businessId)"), "rules: contingencies are readable by whoever reads the books");
ok(block.slice(0, 300).includes("allow create, update: if isOwnerOrManager(businessId)"), "rules: owner or manager can write contingencies");
ok(block.slice(0, 300).includes("allow delete: if isOwner(businessId) && !isPublicDemo(businessId)"), "rules: only the owner deletes, never in the public demo");
const ctx = readFileSync(new URL("../contexts/DataContext.tsx", import.meta.url), "utf8");
ok(ctx.includes('collection(db, "users", businessId, "contingencies")'), "the data layer listens to the contingencies collection");
ok(ctx.includes('"employees", "loans", "contingencies", "dataRequests", "budgets"') && ctx.includes('"taxPayments", "loans", "contingencies", "dataRequests", "budgets", "settings", "cashCounts"'), "the owner and manager subscription lists include contingencies and data requests");
ok(ctx.includes("addContingency: async") && ctx.includes("deleteContingency: async"), "the data layer has add, update and delete for contingencies");
ok(ctx.includes('requirePermission("delete:records")') && ctx.includes('doc(db, "users", bizId, "contingencies", docId)'), "delete requires delete:records on the contingencies document");

console.log(`\n${failed === 0 ? "All checks passed" : `${failed} FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
