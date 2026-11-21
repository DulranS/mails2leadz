// Checks card payments (PayHere signatures and amounts) and overdue reminders (contact parsing, intervals, wording). Pure functions only.
// Run: npx tsx scripts/verify-payments-reminders.ts
import { createHash } from "crypto";
import { payhereCheckoutHash, payhereNotifySig, payhereNoticeIsPaid, formatPayhereAmount, newPayhereOrderId } from "../lib/payhere";
import { customerEmail, clampReminderDays, reminderDue, reminderText } from "../lib/overdueReminders";

let failed = false;
function check(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); failed = true; } else console.log("OK:", msg);
}
const md5 = (s: string) => createHash("md5").update(s).digest("hex").toUpperCase();

// Checkout hash follows the documented formula, computed here independently.
const secret = "s3cret";
check(payhereCheckoutHash("121212", "ORDER1", "100.00", "LKR", secret) === md5("121212ORDER1100.00LKR" + md5(secret)), "checkout hash follows the PayHere formula");

// Notice signature and the acceptance rule.
const notice = (over: Partial<Record<string, string>> = {}) => {
  const base = { merchant_id: "121212", order_id: "ORDER1", payhere_amount: "100.00", payhere_currency: "LKR", status_code: "2", md5sig: payhereNotifySig("121212", "ORDER1", "100.00", "LKR", "2", secret) };
  return { ...base, ...over };
};
const expect = { merchantId: "121212", orderId: "ORDER1", amount: "100.00", currency: "LKR" };
check(payhereNoticeIsPaid(notice(), expect, secret), "a genuine successful notice is accepted");
check(!payhereNoticeIsPaid(notice(), expect, "wrong-secret"), "a notice signed with another business's secret is refused");
check(!payhereNoticeIsPaid(notice({ status_code: "0" }), expect, secret), "a notice that is not status 2 is refused");
check(!payhereNoticeIsPaid(notice({ payhere_amount: "1.00" }), expect, secret), "a notice for a different amount is refused");
check(!payhereNoticeIsPaid(notice({ payhere_currency: "USD" }), expect, secret), "a notice in a different currency is refused");
check(!payhereNoticeIsPaid(notice({ order_id: "OTHER" }), expect, secret), "a notice for another order is refused");
check(!payhereNoticeIsPaid(notice({ merchant_id: "999" }), expect, secret), "a notice for another merchant is refused");
check(!payhereNoticeIsPaid({ ...notice(), md5sig: "0".repeat(32) }, expect, secret), "a notice with a forged signature is refused");
check(payhereNotifySig("121212", "ORDER1", "100.00", "LKR", "2", secret) === notice().md5sig, "the notice signature matches its formula");

check(formatPayhereAmount(1234.5) === "1234.50" && formatPayhereAmount(0.1 + 0.2) === "0.30", "amounts are sent with two decimals");
const id = newPayhereOrderId();
check(/^[0-9A-F]{24}$/.test(id) && id !== newPayhereOrderId(), "order references are unguessable and unique");

// Reminders: contact parsing, intervals, wording.
check(customerEmail("0771234567 amal@example.lk") === "amal@example.lk", "an email is found in a contact that also has a phone number");
check(customerEmail("0771234567") === null && customerEmail(undefined) === null, "a phone-only contact gets no reminder");
check(clampReminderDays(0) === 1 && clampReminderDays(999) === 60 && clampReminderDays(undefined) === 7, "reminder interval is kept between 1 and 60 days, default 7");
check(reminderDue(undefined, "2026-11-02", 7), "a first reminder is always due");
check(!reminderDue("2026-10-27", "2026-11-02", 7) && reminderDue("2026-10-26", "2026-11-02", 7), "a reminder is due once the interval has passed, not before");
const msg = reminderText({ ref: "INV-ABC123", businessName: "Perera Works", currency: "LKR", balance: 1200, dueDate: "2026-10-20", link: "https://x.example/invoice/t", paymentInstructions: "Bank: ABC" });
check(msg.subject.includes("INV-ABC123") && msg.text.includes("LKR 1,200.00") && msg.text.includes("2026-10-20"), "the reminder states the invoice, balance and due date");
check(msg.text.includes("https://x.example/invoice/t") && msg.text.includes("Bank: ABC"), "the reminder carries the invoice link and the payment instructions");
check(!/marketing|unsubscribe offer|% off/i.test(msg.text), "the reminder is a payment reminder, not marketing");

if (failed) process.exitCode = 1; else console.log("\nALL CHECKS PASSED");
