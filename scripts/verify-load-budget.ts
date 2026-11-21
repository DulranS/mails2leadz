// When to window the data (lib/loadBudget.ts and the System check): a small business gets no warning, a large collection or a large total triggers it, the
// reason names what is large, and the System check shows the warning. Run: npx tsx scripts/verify-load-budget.ts
import fs from "node:fs";
import { windowingDue, TOTAL_DOCS_TRIGGER, ONE_COLLECTION_TRIGGER } from "../lib/loadBudget";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(!windowingDue({ totalDocs: 110, top: [{ name: "auditLog", docs: 72 }] }).due, "a small business, like the test account with 110 records, gets no warning");
ok(windowingDue({ totalDocs: 3000, top: [{ name: "users/a/sales", docs: 2500 }] }).due, "one collection past 2,000 documents triggers the warning, and the reason names it");
ok(windowingDue({ totalDocs: 6000, top: [{ name: "users/a/sales", docs: 1500 }] }).due, "a total past 5,000 documents triggers it even when no single collection is large");
ok(!windowingDue({ totalDocs: TOTAL_DOCS_TRIGGER - 1, top: [{ name: "x", docs: ONE_COLLECTION_TRIGGER - 1 }] }).due, "just under both thresholds is not yet due");
ok(windowingDue({ totalDocs: 2500, top: [{ name: "users/a/sales", docs: 2500 }] }).reason?.includes("users/a/sales") === true, "the reason says which collection is large");
ok(windowingDue({ totalDocs: 0, top: [] }).due === false, "with nothing loaded, nothing is due");
const screen = read("components/ops/SystemCheckPanel.tsx");
ok(screen.includes("windowingDue(") && screen.includes("Windowing is due"), "the System check shows the warning when it is due");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
