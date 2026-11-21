// Second signer on supplier payments (lib/secondSignOff.ts, lib/operations.ts, the data layer, the form, Settings): a payment above the limit goes to a second
// signer; at or below it is recorded; the person who recorded a payment cannot approve it; a manager is still held to their limit; a payment request must carry
// its details; the payment kind is not in the request picker; the approval writes the payment. Worked numbers. Run: npx tsx scripts/verify-second-signoff.ts
import fs from "node:fs";
import { paymentRoute, canApprovePayment } from "../lib/secondSignOff";
import { decideRequestPlan, validateRequestInput, REQUEST_KINDS } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

ok(paymentRoute(15000, 10000) === "second_signer", "a payment of 15,000 over a limit of 10,000 goes to a second signer");
ok(paymentRoute(10000, 10000) === "record", "a payment exactly at the limit is recorded straight away");
ok(paymentRoute(5000, 10000) === "record", "a payment below the limit is recorded straight away");
ok(paymentRoute(999999, undefined) === "record" && paymentRoute(999999, 0) === "record", "with no limit set, nothing needs a second signer");
ok(canApprovePayment("u1", "u1") === false, "the person who recorded a payment cannot approve it");
ok(canApprovePayment("u1", "u2") === true && canApprovePayment("u1", undefined) === false, "a different signed-in person can, and nobody unknown can");

const pay = { id: "r1", kind: "payment" as const, status: "pending" as const, amount: 15000, createdByUid: "u1" };
const now = 1;
ok(!decideRequestPlan(pay, "approved", { role: "owner", name: "A" }, now, undefined, "u1").ok, "the owner who recorded the payment is refused when approving it");
ok(decideRequestPlan(pay, "approved", { role: "owner", name: "A" }, now, undefined, "u2").ok, "a different owner can approve it");
ok(!decideRequestPlan(pay, "approved", { role: "manager", name: "M" }, now, 10000, "u2").ok, "a manager whose limit is 10,000 cannot approve a 15,000 payment");
ok(decideRequestPlan(pay, "approved", { role: "manager", name: "M" }, now, 20000, "u2").ok, "a manager within their limit can approve it");
ok(decideRequestPlan(pay, "declined", { role: "owner", name: "A" }, now, undefined, "u1").ok, "declining is not blocked by the rule (the requester can withdraw it through cancel)");

ok(validateRequestInput({ kind: "payment", title: "Pay Supplier", date: "2026-11-16", amount: 15000, payload: { purchaseId: "p1" } }) === null, "a payment request with its details is valid");
ok(validateRequestInput({ kind: "payment", title: "Pay Supplier", date: "2026-11-16", amount: 15000 }) !== null, "a payment request without its details is refused");
ok(!REQUEST_KINDS.some((k) => (k.value as string) === "payment"), "the payment kind is not in the request picker");

const ops = read("lib/operations.ts");
ok(ops.includes("export type RequestKind = \"spend\" | \"claim\" | \"shift\" | \"payment\"") && ops.includes("uid?: string"), "the request kind and the decision carry the payment case and the approver");
const ctx = read("contexts/DataContext.tsx");
ok(ctx.includes("req.kind === \"payment\" && req.payload") && ctx.includes("approvedByUid: myUid"), "approval writes the supplier payment, and records who approved it");
ok(ctx.includes("settings.managerApprovalLimit, myUid)"), "the decision is made with the approver's identity");
const form = read("components/RecordPayablePaymentForm.tsx");
ok(form.includes("paymentRoute(amt, settings.secondSignOffAbove)") && form.includes("kind: \"payment\""), "the payment form sends large payments for a second signature");
ok(read("app/settings/page.tsx").includes("secondSignOffAbove"), "the threshold is set in Settings");
const bill = read("components/RecordBillPaymentForm.tsx");
ok(bill.includes("paymentRoute(amt, settings.secondSignOffAbove)") && bill.includes("paymentType: \"bill\""), "the bill payment form sends large bill payments for a second signature");
ok(ctx.includes("paymentType === \"bill\" ? \"billPayments\" : \"payablePayments\""), "an approved bill payment is written to bill payments, not supplier payments");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
