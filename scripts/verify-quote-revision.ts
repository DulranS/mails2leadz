// Checks the rules behind quote revisions, the customer link, quote follow-up and the per-business AI key.
// Pure functions only, no database. Run: npx tsx scripts/verify-quote-revision.ts
import { computeRevisionSettlement, settlementMessage, quoteDecisionBlock, quotesNeedingFollowUp, daysBetweenIso } from "../lib/quoteRevision";
import { chooseAiKey, operatorBusinessIds } from "../lib/aiKey";
import { isValidBusinessId } from "../lib/enquiry";
import { lockedSaleEditAllowed } from "../lib/salesLock";
import { summariseInvoice, claimProblem, invoiceRefFor } from "../lib/invoicePortal";
import type { Estimate } from "../lib/types";

let failed = false;
function check(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); failed = true; } else console.log("OK:", msg);
}

// Settlement: a surplus stays as credit, never refunded; a shortfall is still due.
const over = computeRevisionSettlement(800, 1000);
check(over.creditToKeep === 200 && over.stillDue === 0, "deposit above the revised total stays as a 200 credit");
const under = computeRevisionSettlement(1200, 1000);
check(under.stillDue === 200 && under.creditToKeep === 0, "revised total above the deposit leaves 200 still due");
check(settlementMessage(over, "Amal")?.includes("stays on their account as a credit") === true, "surplus message says credit, not refund");
check(settlementMessage(computeRevisionSettlement(500, 0), "Amal") === null, "no deposit held, no settlement message");

// Customer link: a quote can be answered only while it is sent and valid.
const base = { status: "sent", validUntil: "2026-12-31" } as Pick<Estimate, "status" | "validUntil" | "supersededBy">;
check(quoteDecisionBlock(base, "2026-11-02") === null, "sent quote inside its validity can be answered");
check(quoteDecisionBlock({ ...base, validUntil: "2026-10-01" }, "2026-11-02") === "expired", "past its validity date cannot be answered");
check(quoteDecisionBlock({ ...base, status: "draft" }, "2026-11-02") === "not_sent", "a draft is not open to the customer");
check(quoteDecisionBlock({ ...base, supersededBy: "x" }, "2026-11-02") === "replaced", "a replaced quote's old link is refused");
check(quoteDecisionBlock({ ...base, status: "accepted" }, "2026-11-02") === "decided", "an already answered quote is refused");

// Follow-up: only sent quotes with a date inside the window, most urgent first.
const est = (id: string, status: Estimate["status"], validUntil?: string) =>
  ({ id, status, validUntil, date: "2026-10-01", lines: [], createdAt: 0 }) as Estimate;
const list = quotesNeedingFollowUp(
  [est("a", "sent", "2026-11-04"), est("b", "sent", "2026-10-30"), est("c", "sent", "2026-12-30"), est("d", "accepted", "2026-11-03"), est("e", "sent")],
  "2026-11-02"
);
check(list.map((f) => f.estimate.id).join(",") === "b,a", "chase list holds sent quotes inside 7 days or past, most urgent first");
check(list[0].state === "expired" && list[1].state === "expiring", "states are expired and expiring");
check(daysBetweenIso("2026-11-02", "2026-11-04") === 2, "day count across a month edge is right");

// AI key: own key when switched on; operator key only for demo or the operator's own businesses; nothing otherwise.
const none = new Set<string>();
const own = chooseAiKey({ ownKey: "sk-own", enabled: true, accountKind: "standard", businessId: "biz1", operatorIds: none, operatorKey: "sk-op" });
check(own?.source === "own", "a business with its own switched-on key uses it");
const offOwn = chooseAiKey({ ownKey: "sk-own", enabled: false, accountKind: "standard", businessId: "biz1", operatorIds: none, operatorKey: "sk-op" });
check(offOwn === null, "a saved but switched-off key is not used, and a paying account gets no operator key");
const demo = chooseAiKey({ ownKey: null, accountKind: "public_demo", businessId: "demo", operatorIds: none, operatorKey: "sk-op" });
check(demo === null, "the public demo gets no operator key (it must be listed in AI_OPERATOR_BUSINESS_IDS to use it)");
const trial = chooseAiKey({ ownKey: null, accountKind: "trial", businessId: "t1", operatorIds: none, operatorKey: "sk-op" });
check(trial === null, "a trial account must bring its own key");
const ops = operatorBusinessIds({ AI_OPERATOR_BUSINESS_IDS: "opbiz1, opbiz2" });
const mine = chooseAiKey({ ownKey: null, accountKind: "standard", businessId: "opbiz2", operatorIds: ops, operatorKey: "sk-op" });
check(mine?.source === "operator", "a business listed in AI_OPERATOR_BUSINESS_IDS uses the operator key");

// Business ids from a public URL: only plain id characters.
check(isValidBusinessId("AbCdEf1234GhIj5678KlMnOp9012"), "a normal Firebase uid is a valid business id");
check(!isValidBusinessId("../users/x"), "a path-like business id is refused");

check(lockedSaleEditAllowed({ notes: "x" }) && lockedSaleEditAllowed({ projectId: undefined }), "a locked sale still lets its note and project change");
check(!lockedSaleEditAllowed({ unitPrice: 10 }) && !lockedSaleEditAllowed({ qty: 2, notes: "x" }), "a locked sale refuses price or quantity changes");

// Invoice portal: the balance the customer sees, and the claim rule.
const line = (id: string, qty: number, unitPrice: number, extra: Partial<Estimate> = {}) =>
  ({ id, productId: "p1", qty, unitPrice, date: "2026-10-01", paymentMethod: "credit", taxAmount: 0, invoiceId: "inv1", customer: "Amal", createdAt: 1, ...extra }) as unknown as import("../lib/types").Sale;
const credit = summariseInvoice({
  sales: [line("s1", 2, 500, { taxAmount: 180 } as Partial<Estimate>), line("s2", 1, 200)],
  returns: [], discounts: [], payments: [{ id: "r1", saleId: "s1", amount: 300, date: "2026-10-05", method: "bank_transfer", createdAt: 1 } as unknown as import("../lib/types").ReceivablePayment],
  today: "2026-11-02",
});
check(credit.gross === 1200 && credit.tax === 180 && credit.total === 1380, "invoice total is net revenue plus tax (1,380)");
check(credit.paid === 300 && credit.balance === 1080, "balance is total less receivable payments recorded (1,080)");
check(claimProblem(900, credit) === null, "a part payment claim within the balance is accepted");
check(claimProblem(1200, credit) !== null && claimProblem(1080, credit) === null, "a claim above the balance is refused; the exact balance is accepted");
const cash = summariseInvoice({ sales: [line("c1", 1, 100, { paymentMethod: "cash" } as Partial<Estimate>)], returns: [], discounts: [], payments: [], today: "2026-11-02" });
check(!cash.isCredit && cash.balance === 0 && claimProblem(50, cash) !== null, "a cash sale is paid up front and cannot be claimed against");
check(invoiceRefFor("abcdef123456") === "INV-123456", "invoice reference matches the Invoices page");

if (failed) process.exitCode = 1; else console.log("\nALL CHECKS PASSED");
