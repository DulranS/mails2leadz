// Feedback loops (lib/feedbackLoops.ts): an improvement needs an owner and a day; overdue and open are counted; an alternative supplier is compared
// on price (cheaper or not, by how much); single-source products with no live alternative are listed; wiring and roles. Run:
// npx tsx scripts/verify-feedback-loops.ts
import fs from "node:fs";
import { validateImprovement, improvementSummary, validateAlternative, compareQuote, uncoveredSingleSource, type Improvement, type Alternative } from "../lib/feedbackLoops";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const today = "2026-11-09";

ok(validateImprovement({ title: "Stop the lid leaking", owner: "Ruwan", dueDate: "2026-11-20", source: "customer" }) === null, "a customer complaint turned into an improvement with an owner and a day is accepted");
ok(validateImprovement({ title: "Fix it", owner: "Ruwan", dueDate: "2026-11-20", source: "customer" }) !== null, "a title too short to say what should change is refused");
ok(validateImprovement({ title: "Stop the lid leaking", owner: "", dueDate: "2026-11-20", source: "customer" }) !== null, "an improvement with no owner is refused");
ok(validateImprovement({ title: "Stop the lid leaking", owner: "Ruwan", dueDate: "2026-02-30", source: "customer" }) !== null, "a due day that does not exist is refused");

const items: Improvement[] = [
  { id: "1", title: "Lid", source: "customer", owner: "Ruwan", dueDate: "2026-11-01", status: "open" },
  { id: "2", title: "Label", source: "team", owner: "Sunil", dueDate: "2026-12-01", status: "open" },
  { id: "3", title: "Seal", source: "customer", owner: "Dilani", dueDate: "2026-10-01", status: "done", doneOn: "2026-10-20" },
  { id: "4", title: "Old", source: "other", owner: "A", dueDate: "2026-09-01", status: "dropped" },
];
const s = improvementSummary(items, today);
ok(s.open === 2 && s.overdue.length === 1 && s.overdue[0].id === "1", "open improvements are counted, and the overdue one is found");
ok(s.fromCustomers === 2 && s.doneFromCustomers === 1, "customer-sourced improvements, and how many of them are done, are shown, so the loop can be seen closing");
ok(!s.overdue.some((i) => i.status === "dropped"), "a dropped improvement is not counted as overdue");

ok(validateAlternative({ productId: "flour", alternative: "Ceylon Mills", quoteUnitCost: 95 }) === null, "an alternative for a product, with a quote, is accepted");
ok(validateAlternative({ productId: "flour", alternative: "Ceylon Mills", quoteUnitCost: 0 }) !== null, "an alternative with no price is refused");
const cheaper = compareQuote(100, 95);
ok(cheaper !== null && cheaper.cheaper === true && cheaper.differencePct === -5, "a quote 5% below what is paid now is cheaper, by 5%");
const dearer = compareQuote(100, 112);
ok(dearer !== null && dearer.cheaper === false && dearer.differencePct === 12, "a quote 12% above what is paid now is not cheaper, by 12%");
ok(compareQuote(0, 50) === null, "with no current price to compare with, no comparison is made");

const alts: Alternative[] = [
  { id: "a1", productId: "flour", currentSupplier: "MillCo", alternative: "Ceylon Mills", quoteUnitCost: 95, status: "trial" },
  { id: "a2", productId: "eggs", currentSupplier: "FarmA", alternative: "Hill Farms", quoteUnitCost: 40, status: "rejected" },
];
ok(uncoveredSingleSource(["flour", "eggs", "sugar"], alts).join() === "eggs,sugar", "single-source products with a live alternative are left out, and a rejected alternative does not count as cover");
ok(uncoveredSingleSource([], alts).length === 0, "with no single-source products, nothing is uncovered");

ok(tabsForRole("owner").includes("loops") && tabsForRole("manager").includes("loops") && !tabsForRole("staff").includes("loops"), "the feedback loops are for the owner and manager");
ok(read("components/ops/FeedbackLoopsPanel.tsx").includes("uncoveredSingleSource(") && read("components/ops/FeedbackLoopsPanel.tsx").includes("compareQuote("), "the screen lists the uncovered single-source products and compares each quote on price");
ok(read("firestore.rules").includes("match /improvements/{docId}") && read("firestore.rules").includes("match /supplierAlternatives/{docId}"), "improvements and supplier alternatives are stored under their own rules");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
