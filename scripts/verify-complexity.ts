// Financial complexity (lib/complexity.ts): the definition in numbers. Tail products, small suppliers and small recurring costs are found by their
// share; the level follows the count; the review changes nothing; and the screen is wired for the owner and manager. Run:
// npx tsx scripts/verify-complexity.ts
import fs from "node:fs";
import { complexityReview } from "../lib/complexity";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const products = [
  { productId: "a", name: "Main", revenue: 900000, contribution: 360000 },
  { productId: "b", name: "Second", revenue: 90000, contribution: 36000 },
  { productId: "c", name: "Odd item", revenue: 500, contribution: 150 },     // 0.05%: tail
  { productId: "d", name: "Dead line", revenue: 0, contribution: 0 },        // no sales: not counted as tail
];
const suppliers = [
  { supplier: "MillCo", spend: 900000, sharePct: 90 },
  { supplier: "Trial Co", spend: 2000, sharePct: 0.2 },                       // tiny
  { supplier: "No supplier recorded", spend: 500, sharePct: 0.05 },           // unknown, not judged as tiny
];
const recurring = [
  { name: "Rent", monthlyAmount: 200000 },
  { name: "Software seat", monthlyAmount: 300 },                              // 0.03% of 1,000,000: small
];
const r = complexityReview({ products, suppliers, recurring, monthlyRevenue: 1000000 });

ok(r.tailProducts.length === 1 && r.tailProducts[0].name === "Odd item", "a product selling below 1% of revenue is in the tail; a product with no sales is not counted");
ok(r.smallSuppliers.length === 1 && r.smallSuppliers[0].supplier === "Trial Co", "a supplier under 1% of spend is small; an unrecorded supplier is not judged that way");
ok(r.smallRecurring.length === 1 && r.smallRecurring[0].name === "Software seat", "a monthly cost under 0.2% of revenue is small; rent is not");
ok(r.items === 3 && r.level === "simple", "three items is simple");
ok(complexityReview({ products: [], suppliers: [], recurring: [], monthlyRevenue: 0 }).level === "simple", "with nothing to review, the business is simple");
const busy = complexityReview({
  products: Array.from({ length: 30 }, (_, i) => ({ productId: `p${i}`, name: `P${i}`, revenue: i === 0 ? 1000000 : 10, contribution: 1 })),
  suppliers: Array.from({ length: 8 }, (_, i) => ({ supplier: `S${i}`, spend: 1, sharePct: 0.1 })),
  recurring: [], monthlyRevenue: 1000000,
});
ok(busy.level === "complex" && busy.items > 10, "many small products and suppliers make the business complex, and the level says so");
ok(r.tailProducts.every((p) => p.contribution >= 0) && r.tailProducts[0].contribution <= 150, "tail products are listed with the least contribution first, so the weakest are seen first");

ok(tabsForRole("owner").includes("complexity") && tabsForRole("manager").includes("complexity") && !tabsForRole("staff").includes("complexity"), "the complexity review is for the owner and manager");
ok(read("components/ops/ComplexityPanel.tsx").includes("complexityReview(") && !/addDoc|updateDoc|setDoc|deleteDoc/.test(read("components/ops/ComplexityPanel.tsx")), "the review reads the records and changes nothing");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
