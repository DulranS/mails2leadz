// Large cash purchases (lib/cashPayments.ts, v327). Run: tsx scripts/verify-cash-payments.ts
import { readFileSync } from "node:fs";
import { assessmentYearStart, flagCashPayments, CASH_DEDUCTION_LIMIT } from "../lib/cashPayments";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failed++;
  console.log(`${cond ? "OK" : "FAIL"}: ${label}`);
};

const FROM = "2026-04-01";
const TO = "2026-11-20";
const p = (id: string, date: string, qty: number, unitCost: number, paymentMethod: string, supplier = "Acme") => ({ id, date, qty, unitCost, paymentMethod, supplier });

ok(CASH_DEDUCTION_LIMIT === 500000, "the limit is LKR 500,000");
ok(assessmentYearStart("2026-11-20") === "2026-04-01", "November 2026 is in the year that began 1 April 2026");
ok(assessmentYearStart("2027-02-10") === "2026-04-01", "February 2027 is still the year that began 1 April 2026");
ok(assessmentYearStart("2027-04-01") === "2027-04-01", "1 April starts a new year");
ok(assessmentYearStart("2027-03-31") === "2026-04-01", "31 March ends the year");

const single = flagCashPayments([p("a", "2026-06-01", 1, 500000, "cash")], { fromIso: FROM, toIso: TO });
ok(single.length === 1 && single[0].reason === "single" && single[0].total === 500000, "one cash purchase of exactly LKR 500,000 is flagged");

const under = flagCashPayments([p("a", "2026-06-01", 1, 499999.99, "cash")], { fromIso: FROM, toIso: TO });
ok(under.length === 0, "just under the limit is not flagged");

const multi = flagCashPayments([p("a", "2026-06-01", 2, 150000, "cash"), p("b", "2026-06-01", 1, 200000, "cash")], { fromIso: FROM, toIso: TO });
ok(multi.length === 1 && multi[0].reason === "same_day" && multi[0].ids.join(",") === "a,b" && multi[0].total === 500000, "same supplier, same day, adds up to the limit: flagged together");

const otherDay = flagCashPayments([p("a", "2026-06-01", 1, 300000, "cash"), p("b", "2026-06-02", 1, 300000, "cash")], { fromIso: FROM, toIso: TO });
ok(otherDay.length === 0, "two purchases on different days are not added together");

const otherSupplier = flagCashPayments([p("a", "2026-06-01", 1, 300000, "cash", "Acme"), p("b", "2026-06-01", 1, 300000, "cash", "Beta")], { fromIso: FROM, toIso: TO });
ok(otherSupplier.length === 0, "two suppliers on the same day are not added together");

const supplierCase = flagCashPayments([p("a", "2026-06-01", 1, 300000, "cash", " acme "), p("b", "2026-06-01", 1, 300000, "cash", "ACME")], { fromIso: FROM, toIso: TO });
ok(supplierCase.length === 1, "supplier names match ignoring case and spaces");

const card = flagCashPayments([p("a", "2026-06-01", 1, 900000, "card"), p("b", "2026-06-01", 1, 900000, "bank_transfer"), p("c", "2026-06-01", 1, 900000, "credit")], { fromIso: FROM, toIso: TO });
ok(card.length === 0, "card, bank transfer and credit purchases are not flagged");

const outside = flagCashPayments([p("a", "2026-03-31", 1, 900000, "cash"), p("b", "2026-11-21", 1, 900000, "cash")], { fromIso: FROM, toIso: TO });
ok(outside.length === 0, "purchases outside the year are not flagged");

const qty = flagCashPayments([p("a", "2026-06-01", 1000, 500, "cash")], { fromIso: FROM, toIso: TO });
ok(qty.length === 1 && qty[0].total === 500000, "quantity times unit cost is the total");

const sorted = flagCashPayments([p("a", "2026-06-01", 1, 600000, "cash"), p("b", "2026-06-02", 1, 900000, "cash")], { fromIso: FROM, toIso: TO });
ok(sorted[0].total === 900000 && sorted[1].total === 600000, "largest first");

const bad = [p("a", "1 June 2026", 1, 900000, "cash")];
ok(flagCashPayments(bad, { fromIso: FROM, toIso: TO }).length === 0, "a purchase with a bad date is skipped");

// Wiring: the purchases screen shows the flags, and the rule file says it does not change the tax computation
const page = readFileSync(new URL("../app/purchases/page.tsx", import.meta.url), "utf8");
ok(page.includes("flagCashPayments(") && page.includes("from \"@/lib/cashPayments\""), "the purchases screen runs the cash check");
ok(page.includes("Large cash purchases"), "the purchases screen labels the cash warning");
const src = readFileSync(new URL("../lib/cashPayments.ts", import.meta.url), "utf8");
ok(src.includes("does not change the tax computation"), "the rule file states that it flags and does not change tax");

console.log(`\n${failed === 0 ? "All checks passed" : `${failed} FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
