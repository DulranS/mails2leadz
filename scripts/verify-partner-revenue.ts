// Partner revenue (lib/partnerRevenue.ts, the screen, the tab): revenue from customers a partner referred, unattributed revenue, matching that ignores case
// and spacing but not spelling, the period cut-off, the no-revenue case, and the owner and manager tab. Worked numbers. Run: npx tsx scripts/verify-partner-revenue.ts
import fs from "node:fs";
import { partnerRevenue } from "../lib/partnerRevenue";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const customers = [
  { name: "Nimal Stores", referredBy: "Kandy Distributors" },
  { name: "Hotel Blue", referredBy: "kandy   distributors" },   // same partner, different case and spacing
  { name: "Ravi", referredBy: "Galle Agents" },
  { name: "Amal" },                                             // no referrer
];
const sales = [
  { date: "2026-10-03", qty: 2, unitPrice: 1000, customer: "Nimal Stores" },  // 2,000
  { date: "2026-10-09", qty: 1, unitPrice: 3000, customer: "Hotel Blue" },    // 3,000
  { date: "2026-10-12", qty: 1, unitPrice: 1000, customer: "Ravi" },          // 1,000
  { date: "2026-10-20", qty: 1, unitPrice: 4000, customer: "Amal" },          // 4,000
  { date: "2026-10-22", qty: 1, unitPrice: 500 },                             // walk-in: unattributed
  { date: "2026-09-05", qty: 1, unitPrice: 9000, customer: "Nimal Stores" },  // outside the period
];
const r = partnerRevenue(customers, sales, ["Kandy Distributors", "Galle Agents", "Colombo Resellers"], { from: "2026-10", to: "2026-10" });
const kandy = r.rows.find((x) => x.partner === "Kandy Distributors")!;
ok(kandy.revenue === 5000 && kandy.customers === 2, "Kandy Distributors brought in two customers worth 5,000 (2,000 + 3,000), matched ignoring case and spacing");
ok(r.rows.find((x) => x.partner === "Galle Agents")!.revenue === 1000, "Galle Agents' referred customer is worth 1,000");
ok(r.rows.find((x) => x.partner === "Colombo Resellers")!.revenue === 0 && r.rows.find((x) => x.partner === "Colombo Resellers")!.customers === 0, "a partner with no referred customers shows zero, not a guess");
ok(r.total === 10500 && r.unattributed === 4500, "October's total is 10,500 (2,000 + 3,000 + 1,000 + 4,000 + 500); the 4,000 from Amal (no referrer) and the 500 walk-in sale, 4,500 in all, are unattributed");
ok(r.rows.find((x) => x.partner === "Kandy Distributors")!.sharePct === 47.6, "Kandy's 5,000 of 10,500 is 47.6% of the period's revenue");
ok(partnerRevenue(customers, [], ["Kandy Distributors"], { from: "2026-10", to: "2026-10" }).rows[0].sharePct === null, "with no revenue, no share is shown");
ok(partnerRevenue([{ name: "X Ltd", referredBy: "Kandy Distributor" }], [{ date: "2026-10-01", qty: 1, unitPrice: 100, customer: "X Ltd" }], ["Kandy Distributors"], { from: "2026-10", to: "2026-10" }).rows[0].revenue === 0, "a misspelt referrer is not matched, so it does not count for the partner");

const screen = read("components/ops/PartnerRevenuePanel.tsx");
ok(screen.includes("partnerRevenue(") && !/addDoc|updateDoc|setDoc|deleteDoc/.test(screen), "the screen reads the customers, sales and partners and changes nothing");
ok(tabsForRole("owner").includes("partnerrevenue") && tabsForRole("manager").includes("partnerrevenue") && !tabsForRole("staff").includes("partnerrevenue"), "partner revenue is for the owner and manager");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
