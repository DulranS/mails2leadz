// Contractor and talent shares (lib/contractorShare.ts, the product form, the screen): worked numbers for a contractor across two products, the unassigned
// revenue, an invalid share reported and left unassigned, sales outside the period excluded, the rounding done once per contractor, and the wiring. Run:
// npx tsx scripts/verify-contractor-share.ts
import fs from "node:fs";
import { contractorShares } from "../lib/contractorShare";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const products = [
  { id: "A", name: "Show", contractorName: "Nimal", contractorSharePct: 30 },
  { id: "B", name: "Workshop", contractorName: "nimal ", contractorSharePct: 30 },
  { id: "C", name: "Consulting", contractorName: "Kamal", contractorSharePct: 150 },
  { id: "D", name: "Retainer" },
];
const sales = [
  { id: "1", date: "2026-10-03", productId: "A", qty: 10, unitPrice: 1000 },  // 10,000 for Nimal
  { id: "2", date: "2026-10-12", productId: "B", qty: 2, unitPrice: 500 },    // 1,000 for Nimal (same person, different spacing and case)
  { id: "3", date: "2026-10-15", productId: "C", qty: 1, unitPrice: 4000 },   // invalid share: unassigned
  { id: "4", date: "2026-10-20", productId: "D", qty: 1, unitPrice: 2500 },   // no contractor: unassigned
  { id: "5", date: "2026-09-30", productId: "A", qty: 1, unitPrice: 9999 },   // outside October: excluded
];
const r = contractorShares(sales, products, { from: "2026-10", to: "2026-10" });
ok(r.contractors.length === 1 && r.contractors[0].name === "Nimal", "one contractor, Nimal, even though the two products spell the name differently");
ok(r.contractors[0].revenue === 11000 && r.contractors[0].earned === 3300, "Nimal's revenue is 11,000 across both products and earns 30%: 3,300");
ok(r.unassignedRevenue === 6500, "sales with no contractor, or with an invalid share, are unassigned: 4,000 plus 2,500");
ok(r.problems.length === 1 && r.problems[0].includes("Consulting"), "the invalid share on Consulting is reported as a problem");
ok(r.totalEarned === 3300, "the total earned is Nimal's share");
ok(!r.contractors.some((c) => c.revenue === 21000), "the sale outside October is not counted");
const cents = contractorShares([{ id: "x", date: "2026-10-01", productId: "A", qty: 1, unitPrice: 33.33 }], products, { from: "2026-10", to: "2026-10" });
ok(cents.contractors[0].earned === 10, "the share is rounded once per contractor: 30% of 33.33 is 10 (9.999 rounded)");

const screen = read("components/ops/ContractorSharePanel.tsx");
ok(screen.includes("contractorShares(") && !/addDoc|updateDoc|setDoc|deleteDoc/.test(screen), "the screen reads the sales and products and changes nothing");
const form = read("app/products/page.tsx");
ok(form.includes("contractorSharePct") && form.includes("contractorName"), "the product form takes the contractor and the share");
ok(read("lib/operations.ts").includes('"contractorshare"'), "the report is on the Operations page");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
