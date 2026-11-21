// Automatic draft orders (lib/autoDraft.ts): which buying-list lines become drafts, the ones skipped (no cost, nothing to order, already on order, or
// already open), the once-a-day rule, and the wiring that keeps a draft unsent until approved. Run: npx tsx scripts/verify-auto-draft.ts
import fs from "node:fs";
import { draftLinesFor, alreadyDraftedToday, type DraftCandidate } from "../lib/autoDraft";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const line = (o: Partial<DraftCandidate> & { productId: string }): DraftCandidate => ({ name: o.productId, supplier: "MillCo", suggestQty: 10, unitCost: 100, costKnown: true, onOrder: 0, ...o });
const lines = [
  line({ productId: "flour" }),                        // due: a draft
  line({ productId: "sugar", costKnown: false }),       // no cost: left for a person
  line({ productId: "eggs", suggestQty: 0 }),           // nothing to order
  line({ productId: "salt", onOrder: 5 }),              // already on order
  line({ productId: "rice" }),                          // already has an open draft
  line({ productId: "oil" }),                           // an old, received order does not block it
];
const drafts = draftLinesFor(lines, [{ productId: "rice", status: "draft" }, { productId: "oil", status: "received" }]);
ok(drafts.map((d) => d.productId).join() === "flour,oil", "only lines that are due, costed and not already open become drafts");
ok(draftLinesFor(lines, [{ productId: "flour", status: "awaiting_approval" }]).every((d) => d.productId !== "flour"), "a product already waiting for approval is not drafted again");
ok(draftLinesFor(lines, [{ productId: "oil", status: "cancelled" }]).some((d) => d.productId === "oil"), "a cancelled order does not block a new draft");
ok(draftLinesFor([], []).length === 0, "an empty buying list makes no drafts");

ok(alreadyDraftedToday("2026-11-10", "2026-11-10") === true && alreadyDraftedToday("2026-11-09", "2026-11-10") === false && alreadyDraftedToday(undefined, "2026-11-10") === false, "drafts are made once a day, and the day is remembered");

const card = read("components/BuyingListCard.tsx");
ok(card.includes("draftLinesFor(") && card.includes("alreadyDraftedToday(") && card.includes("addDraftPurchaseOrders("), "the buying list makes the day's drafts, once, when it is opened");
const ctx = read("contexts/DataContext.tsx");
ok(ctx.includes("addDraftPurchaseOrders: async") && ctx.includes("sendDraftPurchaseOrder: async") && ctx.includes('status: "draft"'), "drafts are stored as drafts, and sending one applies the approval rule");
ok(ctx.includes("needsPoApproval(po.qtyOrdered") || read("contexts/DataContext.tsx").includes("needsPoApproval(qtyOrdered") || ctx.includes("needsPoApproval(qty"), "sending a draft uses the same approval amount as any other order");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);

// Suggested order matches for purchases (lib/invoiceMatch.ts suggestOrdersForPurchases).
import { suggestOrdersForPurchases } from "../lib/invoiceMatch";
const orders = [
  { id: "o1", status: "received", supplier: "MillCo", productId: "flour", qtyOrdered: 10, qtyReceived: 10 },
  { id: "o2", status: "received", supplier: "MillCo", productId: "flour", qtyOrdered: 5 },
  { id: "o3", status: "received", supplier: "FarmA", productId: "flour", qtyOrdered: 10 },
  { id: "o4", status: "ordered", supplier: "MillCo", productId: "flour", qtyOrdered: 10 },
];
const open = suggestOrdersForPurchases(orders, [
  { id: "p1", productId: "flour", qty: 10, supplier: "millco" },   // same supplier ignoring case, same quantity as o1
  { id: "p2", productId: "flour", qty: 7, supplier: "MillCo" },    // no order of 7 exists
]);
ok(open.length === 1 && open[0].purchaseId === "p1" && open[0].orderIds.join() === "o1", "a bill with no order is suggested the received order from the same supplier, product and quantity");
ok(!open.some((s) => s.orderIds.includes("o3")), "another supplier's order is never suggested");
const used = suggestOrdersForPurchases(orders, [
  { id: "p1", productId: "flour", qty: 10, supplier: "MillCo" },
  { id: "p3", productId: "flour", qty: 10, supplier: "MillCo", purchaseOrderId: "o1" }, // o1 is already linked to p3
]);
ok(used.length === 0, "an order already linked to a purchase is not suggested for another one");
console.log(`${checks - fails}/${checks} checks passed (with suggestions)`);
if (fails) process.exit(1);
