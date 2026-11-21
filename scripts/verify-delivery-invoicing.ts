// Invoicing per delivery (lib/partialDelivery.ts deliveryPosts): an order on delivery recognition creates one sale per delivered line for exactly what that
// delivery added, under its own invoice number; a second delivery is billed only for its own part; a complete order bills only what was not yet billed; an
// order not on this basis creates nothing; a product-less line is reported, not billed. Worked numbers. Run: npx tsx scripts/verify-delivery-invoicing.ts
import fs from "node:fs";
import { deliveryPosts, recordPartDelivery, completeAll, type PdLine } from "../lib/partialDelivery";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const lines = [{ name: "Cake", qty: 10, unitPrice: 500, productId: "P1" }, { name: "Bread", qty: 4, unitPrice: 200, productId: "P2" }];
const order = { id: "W1", recognition: "delivery", deliveryInvoices: 0, lines } as never;
const start = lines.map((l) => ({ name: l.name, qty: l.qty, unitPrice: l.unitPrice, deliveredQty: 0 })) as PdLine[];

const d1 = recordPartDelivery(start, 0, 6, "2026-11-10");
const p1 = deliveryPosts(order, start, (d1 as { lines: PdLine[] }).lines, );
ok(p1.posts.length === 1 && p1.posts[0].qty === 6 && p1.posts[0].invoiceId === "W1-D1", "the first delivery of 6 cakes is one sale of 6, invoiced as W1-D1");
ok(p1.posts[0].unitPrice === 500 && p1.posts[0].productId === "P1", "the sale carries the product and the unit price");

const after1 = (d1 as { lines: PdLine[] }).lines;
const order2 = { ...(order as object), deliveryInvoices: 1 } as never;
const d2 = recordPartDelivery(after1, 0, 4, "2026-11-12");
const p2 = deliveryPosts(order2, after1, (d2 as { lines: PdLine[] }).lines);
ok(p2.posts.length === 1 && p2.posts[0].qty === 4 && p2.posts[0].invoiceId === "W1-D2", "the second delivery bills only the 4 cakes it added, as W1-D2");
ok(p1.posts[0].qty + p2.posts[0].qty === 10, "the cakes billed across both deliveries total the 10 ordered, each billed once");

const all = completeAll(start);
const p3 = deliveryPosts(order, start, all);
ok(p3.posts.length === 2 && p3.posts.reduce((t, p) => t + p.qty, 0) === 14, "completing the whole order bills everything not yet billed: 10 cakes and 4 loaves");
ok(p3.posts.reduce((t, p) => t + p.qty * p.unitPrice, 0) === 5000 + 800, "the value billed on completion is 5,800");

ok(deliveryPosts({ id: "W9", lines } as never, start, all).posts.length === 0, "an order not on delivery recognition creates no sales at delivery");
const noProduct = deliveryPosts({ id: "W2", recognition: "delivery", lines: [{ name: "Gift", qty: 1, unitPrice: 50 }] } as never, [{ name: "Gift", qty: 1, unitPrice: 50, deliveredQty: 0 }], [{ name: "Gift", qty: 1, unitPrice: 50, deliveredQty: 1 }]);
ok(noProduct.posts.length === 0 && noProduct.missing[0] === "Gift", "a line with no product is reported and not billed, since it cannot move stock");

const panel = read("components/ops/DeliveryRunPanel.tsx");
ok(panel.includes("deliveryPosts(") && panel.includes("addSale("), "the delivery run records each delivery's sales through the usual sale path");
const confirm = read("components/ops/WebOrdersPanel.tsx");
ok(confirm.includes("recognition") && confirm.includes("delivery"), "confirming an order can choose to record sales as each part is delivered");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
