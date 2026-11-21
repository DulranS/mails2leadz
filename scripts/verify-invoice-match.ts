// Three-way match (lib/invoiceMatch.ts): every received order has one purchase with the same quantity; a receipt with no purchase, a quantity
// that disagrees, and a purchase with no order are each found; nothing is posted. Run: npx tsx scripts/verify-invoice-match.ts
import fs from "node:fs";
import { threeWayMatch } from "../lib/invoiceMatch";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const orders = [
  { id: "o1", status: "received", supplier: "Ceylon Cement", productId: "A", qtyOrdered: 10, qtyReceived: 10 }, // matched
  { id: "o2", status: "received", supplier: "Kandy Traders", productId: "B", qtyOrdered: 5, qtyReceived: 4 }, // quantity mismatch
  { id: "o3", status: "received", supplier: "Ceylon Cement", productId: "C", qtyOrdered: 8 }, // received, never invoiced
  { id: "o4", status: "ordered", supplier: "Kandy Traders", productId: "D", qtyOrdered: 3 }, // not received: ignored
];
const purchases = [
  { id: "x1", productId: "A", qty: 10, supplier: "Ceylon Cement", purchaseOrderId: "o1" },
  { id: "x2", productId: "B", qty: 5, supplier: "Kandy Traders", purchaseOrderId: "o2" },
  { id: "x3", productId: "E", qty: 2, supplier: "Local Shop" }, // bought off order
  { id: "x4", productId: "F", qty: 1, purchaseOrderId: "gone" }, // refers to a deleted order
];
const m = threeWayMatch(orders, purchases);
const kinds = (k: string) => m.issues.filter((i) => i.kind === k);

ok(m.matched === 1, "an order whose purchase has the same quantity is matched");
ok(kinds("receipt_not_invoiced").length === 1 && kinds("receipt_not_invoiced")[0].reference === "o3", "a received order with no purchase is found");
const qm = kinds("quantity_mismatch");
ok(qm.length === 1 && qm[0].reference === "o2" && qm[0].detail.includes("Received 4") && qm[0].detail.includes("records 5"), "a quantity that differs between the receipt and the purchase is found, with both figures");
ok(kinds("purchase_not_on_order").some((i) => i.reference === "x3" && i.detail.includes("without a purchase order")), "a purchase bought off order is found");
ok(kinds("purchase_not_on_order").some((i) => i.reference === "x4" && i.detail.includes("no longer exists")), "a purchase that refers to a deleted order is found");
ok(!m.issues.some((i) => i.reference === "o4"), "an order not yet received is not judged");
ok(m.issues[0].kind === "receipt_not_invoiced", "the receipts with no invoice come first");
ok(threeWayMatch([], []).issues.length === 0, "no orders and no purchases gives nothing");

ok(read("components/ops/CostVariancePanel.tsx").includes("threeWayMatch(purchaseOrders, purchases)"), "the cost variance tab shows the three-way match");
ok(read("lib/invoiceMatch.ts").length > 0 && !/unitCost|\.save|updateDoc|addDoc/.test(read("lib/invoiceMatch.ts")), "the match reads and reports only; it posts nothing and changes no record");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
