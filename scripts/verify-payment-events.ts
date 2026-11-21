// Invoice status events (lib/invoiceEvents.ts, the operations event route, the payment write): a payment finds its invoice through its sale; a sale with no
// invoice gives no invoice event; the payload carries the invoice id and status only; a payment write sends the event; the route builds the invoice event from
// the invoice's own totals. Run: npx tsx scripts/verify-payment-events.ts
import fs from "node:fs";
import { invoiceStatusPayload, invoiceForPayment } from "../lib/invoiceEvents";
import { OPS_EVENTS } from "../lib/opsEvents";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const p = invoiceStatusPayload("W1-D1", "paid", Date.UTC(2026, 10, 16));
ok(p.event === "invoice.status_changed" && p.invoiceId === "W1-D1" && p.status === "paid", "the event names the invoice and its new status");
ok(!("customer" in p) && !("amount" in p), "the event carries no money or customer details beyond the status");
const sales = [{ id: "s1", invoiceId: "W1-D1" }, { id: "s2" }];
ok(invoiceForPayment("s1", sales) === "W1-D1", "a payment against a sale on an invoice finds that invoice");
ok(invoiceForPayment("s2", sales) === null && invoiceForPayment(undefined, sales) === null, "a payment against a sale with no invoice gives no invoice event");
ok((OPS_EVENTS as readonly string[]).includes("payment.received"), "payment received is an operations event");

const ctx = read("contexts/DataContext.tsx");
ok(/addReceivablePayment: async[\s\S]*?postOpsEvent\(user, businessId, "payment\.received", ref\.id\)/.test(ctx), "recording a payment sends the payment event as it happens");
const route = read("app/api/webhooks/ops-event/route.ts");
ok(route.includes("invoiceStatusPayload(") && route.includes("payment.received") && route.includes("invoiceStatus("), "the route turns a payment into the invoice's status, from its totals");
ok(route.includes("sent: false, reason") || route.includes("not on an invoice"), "a payment with no invoice is answered without sending anything");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
