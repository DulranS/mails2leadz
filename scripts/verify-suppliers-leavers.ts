// Supplier performance (lib/supplierPerformance.ts), the leaver handover (lib/leaverHandover.ts), their tabs and their place in the
// review agenda. Run: npx tsx scripts/verify-suppliers-leavers.ts
import fs from "node:fs";
import { supplierPerformance } from "../lib/supplierPerformance";
import { ownedItemsFor, LEAVER_STEPS } from "../lib/leaverHandover";
import { buildReviewPack, type ReviewPackInput } from "../lib/reviewPack";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-11-03";

const po = (supplier: string, expectedDate: string, receivedDate: string | undefined, unitCost = 100, receivedUnitCost?: number, status = "received") =>
  ({ supplier, status, expectedDate, receivedDate, unitCost, receivedUnitCost, qtyOrdered: 10 });
const orders = [
  po("Ceylon Cement", "2026-10-01", "2026-09-30", 100, 100), // on time
  po("Ceylon Cement", "2026-10-05", "2026-10-05", 100, 110), // on time, paid 10% more
  po("Ceylon Cement", "2026-10-08", "2026-10-08", 100, 100), // on time
  po("Late Ltd", "2026-10-01", "2026-10-05", 100, 100), // 4 days late
  po("Late Ltd", "2026-10-01", "2026-10-03", 100, 100), // 2 days late
  po("Late Ltd", "2026-10-01", "2026-09-30", 100, 100), // on time
  po("Ceylon Cement", "2026-10-20", undefined, 100, undefined, "ordered"), // open and not yet due
  po("Stuck Co", "2026-10-15", undefined, 100, undefined, "in_transit"), // open and overdue
  po("New Co", "2026-10-01", "2026-10-02"), // only one delivery: too few to judge
  { supplier: "", status: "received", unitCost: 1, qtyOrdered: 1 }, // no supplier: ignored
];
const rows = supplierPerformance(orders, TODAY);
const by = (s: string) => rows.find((r) => r.supplier === s)!;

ok(by("Ceylon Cement").onTimePct === 100 && by("Ceylon Cement").received === 3, "a supplier that delivers on the expected day, every time, is 100% on time");
ok(by("Ceylon Cement").priceVariancePct === 3.3, "the price paid is compared with the price quoted (here 10% and 0% on two orders, averaged)");
ok(by("Late Ltd").onTimePct !== null && Math.abs((by("Late Ltd").onTimePct as number) - 33.3) < 0.1 && by("Late Ltd").averageDaysLate === 3, "a supplier late on some deliveries shows the share on time and how late the late ones were");
ok(by("Stuck Co").overdueNow === 1 && by("Stuck Co").flag === "too_few", "an open order past its day counts as overdue now");
ok(by("New Co").flag === "too_few" && by("Ceylon Cement").flag === "good", "one or two deliveries are too few to judge; a supplier who is on time is good");
ok(rows[0].supplier === "Late Ltd" && rows.every((r) => r.supplier !== ""), "the poorest supplier is listed first, and orders with no supplier are ignored");

const people = [
  { name: "Ruwan", ownerName: "Ruwan" }, { name: "Kamal", ownerName: "Kamal" },
];
const owned = ownedItemsFor("Ruwan", {
  kpis: [{ name: "Orders on time", ownerName: "Ruwan" }, { name: "Cash count", ownerName: "Kamal" }],
  decisions: [{ title: "Second driver", ownerName: "Ruwan", status: "open" }, { title: "Old choice", ownerName: "Ruwan", status: "done" }],
  responsibilities: [{ title: "Stock counting", ownerName: "ruwan " }],
});
ok(owned.length === 3 && owned.some((o) => o.title === "Orders on time") && owned.some((o) => o.title === "Stock counting"), "everything owned by the person is found, whatever the case or spacing of the name");
ok(!owned.some((o) => o.title === "Old choice") && !owned.some((o) => o.title === "Cash count"), "a closed decision and another person's KPI are not handed over");
ok(ownedItemsFor("", { kpis: [], decisions: [], responsibilities: [] }).length === 0 && people.length === 2, "with no name there is nothing to hand over");
ok(LEAVER_STEPS.length === 6 && LEAVER_STEPS.some((s) => s.includes("Revoke")), "the leaver steps cover equipment, access, final pay, handover, the rota and the record");

const pack = buildReviewPack({
  escalations: [], decisionsDue: [], kpisOffTarget: [], capacityProblems: [], complianceDue: [], incidentsOpen: [],
  pendingRequests: 0, proceduresToRead: 0, risksToReview: [], objectivesOverdue: [], areasWithNoOwner: [],
  supplierIssues: rows.filter((r) => r.flag === "poor").map((r) => ({ supplier: r.supplier, onTimePct: r.onTimePct, overdueNow: r.overdueNow })),
});
const sup = pack.find((s) => s.key === "suppliers");
ok(!!sup && sup.items.length === 1 && sup.items[0].startsWith("Late Ltd") && sup.items[0].includes("% on time"), "the review agenda raises a supplier that is late too often");

ok(tabsForRole("owner").includes("suppliers") && tabsForRole("manager").includes("leavers") && !tabsForRole("staff").includes("suppliers") && !tabsForRole("staff").includes("leavers"), "supplier performance and leavers are for the owner and manager");
ok(read("components/ops/useReviewSections.ts").includes("supplierPerformance(purchaseOrders, today)"), "the review's supplier issues and the Suppliers tab use one calculation");
ok(read("components/ops/LeaverPanel.tsx").includes("Nothing changes until you do."), "the leaver view states that it reassigns nothing");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
