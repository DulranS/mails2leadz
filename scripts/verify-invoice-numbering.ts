import { readFileSync } from "node:fs";
// Tax-invoice numbering (lib/invoiceNumber.ts, v324). Run: tsx scripts/verify-invoice-numbering.ts
import { invoiceNoFor, invoiceSeqOf, isValidTin, assignInvoiceNos, displayInvoiceRef, findNumberingGaps, findDuplicateInvoiceNos, INVOICE_NO_MAX, tinForCustomer, highestInvoiceSeq } from "../lib/invoiceNumber";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failed++;
  console.log(`${cond ? "OK" : "FAIL"}: ${label}`);
};
const throws = (f: () => unknown) => {
  try {
    f();
    return false;
  } catch {
    return true;
  }
};

// Format: YYMMM_QQQQ_XXXXX
ok(invoiceNoFor(1, "2026-11-20") === "26NOV_1_00001", "first November 2026 invoice is 26NOV_1_00001");
ok(invoiceNoFor(12345, "2026-07-01") === "26JUL_1_12345", "serial is five digits, July 2026");
ok(invoiceNoFor(7, "2026-01-31", "12") === "26JAN_12_00007", "branch code is kept");
ok(invoiceNoFor(100000, "2026-03-05") === "26MAR_1_100000", "a serial past 99999 grows, it does not break");
ok(throws(() => invoiceNoFor(0, "2026-11-20")), "zero sequence is refused");
ok(throws(() => invoiceNoFor(1, "20-11-2026")), "a non-ISO date is refused");
ok(throws(() => invoiceNoFor(1, "2026-13-01")), "month 13 is refused");
ok(throws(() => invoiceNoFor(1, "2026-11-20", "")), "an empty branch code is refused");
ok(throws(() => invoiceNoFor(1, "2026-11-20", "AB")), "a letter in the branch code is refused");
ok(throws(() => invoiceNoFor(1, "2026-11-20", "1234567890123456")), "a branch code over 15 digits is refused");
ok(INVOICE_NO_MAX === 40, "the 40-character maximum is recorded");

// Parsing
ok(invoiceSeqOf("26NOV_1_00042") === 42, "parses the serial from a new-format number");
ok(invoiceSeqOf("INV-000042") === null, "the old INV-000042 style is not a new-format number");
ok(invoiceSeqOf("INV-A1B2C3") === null, "random legacy refs are not numbers");
ok(invoiceSeqOf("26NOV_1_0042") === null, "a serial under five digits is not accepted");
ok(invoiceSeqOf(undefined) === null, "a missing number is not a number");

// TIN: nine digits
ok(isValidTin("123456789"), "nine digits is a valid TIN");
ok(isValidTin(" 123456789 "), "spaces around a TIN are ignored");
ok(!isValidTin("12345678"), "eight digits is refused");
ok(!isValidTin("1234567890"), "ten digits is refused");
ok(!isValidTin("12345678A"), "a letter is refused");
ok(!isValidTin(""), "an empty TIN is refused");

// Allocation
const d = "2026-11-20";
ok(assignInvoiceNos([{ date: d }], []).nos[0] === "26NOV_1_00001", "first invoice on an empty book is 00001");
ok(assignInvoiceNos([{ date: d }], [{ invoiceNo: "26OCT_1_00007" }]).nos[0] === "26NOV_1_00008", "the sequence continues across the month change");
ok(assignInvoiceNos([{ date: d }], [{ invoiceNo: "INV-000009" }]).nos[0] === "26NOV_1_00001", "old-style refs do not move the sequence");
ok(assignInvoiceNos([{ date: d }], [], 9).nos[0] === "26NOV_1_00010", "the session floor stops back-to-back saves repeating");
const three = assignInvoiceNos([{ date: d }, { date: d }, { date: d }], [{ invoiceNo: "26NOV_1_00004" }]);
ok(three.nos.join(",") === "26NOV_1_00005,26NOV_1_00006,26NOV_1_00007", "a batch of separate sales gets consecutive numbers");
const shared = assignInvoiceNos([{ invoiceId: "A", date: d }, { invoiceId: "A", date: d }, { invoiceId: "B", date: d }], []);
ok(shared.nos.join(",") === "26NOV_1_00001,26NOV_1_00001,26NOV_1_00002", "lines of one invoice share a number");
const again = assignInvoiceNos([{ invoiceId: "Z", date: d }], [{ invoiceId: "Z", invoiceNo: "26NOV_1_00003" }]);
ok(again.nos[0] === "26NOV_1_00003", "a later save keeps the invoice's number");
ok(assignInvoiceNos([{ date: d }], []).top === 1, "top reports the highest serial handed out");

// Display
ok(displayInvoiceRef("26NOV_1_00012", "abcdef123456") === "26NOV_1_00012", "shows the new number when present");
ok(displayInvoiceRef(undefined, "abcdef123456") === "INV-123456", "old invoices keep their legacy ref");
ok(displayInvoiceRef("INV-000012", "abcdef123456") === "INV-123456", "the old INV-000012 style is not shown as a number");

// Gaps and duplicates
ok(findNumberingGaps(["26NOV_1_00001", "26NOV_1_00002", "26NOV_1_00004"]).join(",") === "3", "finds a skipped serial");
ok(findNumberingGaps(["26NOV_1_00001", "26NOV_1_00002"]).length === 0, "no gaps in a clean run");
ok(findDuplicateInvoiceNos(["26NOV_1_00003", "26NOV_1_00003", "26NOV_1_00004"]).join(",") === "26NOV_1_00003", "reports a duplicate");
ok(findDuplicateInvoiceNos(["26NOV_1_00001", "26NOV_1_00002"]).length === 0, "no duplicates in a clean run");

// A run of quick saves with no listener update: each uses the previous top as its floor
const seen: string[] = [];
let floor = 0;
for (let i = 0; i < 5; i++) {
  const r = assignInvoiceNos([{ date: d }], [], floor);
  seen.push(r.nos[0]);
  floor = r.top;
}
ok(seen.join(",") === "26NOV_1_00001,26NOV_1_00002,26NOV_1_00003,26NOV_1_00004,26NOV_1_00005", "five quick saves give five consecutive numbers");

// Wiring: the counter, the delete guard, the printed title and the TIN check are in the files that use them
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const dc = readFileSync(new URL("../contexts/DataContext.tsx", import.meta.url), "utf8");
const print = readFileSync(new URL("../lib/print.ts", import.meta.url), "utf8");
const settings = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");
ok(rules.includes("match /meta/invoiceCounter"), "rules: the invoice counter has its own rule");
ok(rules.includes("request.resource.data.last >= resource.data.last"), "rules: the counter only goes up");
ok(rules.includes("allow delete: if false;") && rules.includes("!('invoiceNo' in resource.data)"), "rules: numbered invoices cannot be deleted");
ok(dc.includes("runTransaction(db, async (tx)") && dc.includes("tx.set(counterRef"), "addSale writes the counter and the sale in one transaction");
ok(dc.includes("A numbered invoice cannot be deleted"), "deleteSale refuses a numbered invoice");
ok(dc.includes("numberPending: true") && dc.includes("...(invoiceNo ? { invoiceNo } : { numberPending: true })"), "an offline sale is saved with numberPending and no number");
ok(dc.includes("tx.update(doc(db, \"users\", bizId, \"sales\", x.id)") && dc.includes("for (const x of ordered)"), "the pending pass re-reads each sale inside the transaction before numbering it");
ok(rules.includes("resource.data.numberPending == true") && rules.includes("hasOnly(['invoiceNo', 'numberPending'])"), "rules: an operating member may only give a pending sale its number");
ok(readFileSync(new URL("../lib/print.ts", import.meta.url), "utf8").includes("${supplyDate ?? issueDate}"), "the date of supply prints the entered supply date, falling back to the invoice date");
ok(readFileSync(new URL("../components/QuickForms.tsx", import.meta.url), "utf8").includes("Date of supply (only if different from the date)"), "the sale forms take an optional date of supply");
const glossSrc = readFileSync(new URL("../lib/glossary.ts", import.meta.url), "utf8");
for (const key of ["contingent liability", "systematic risk", "unsystematic risk", "quantitative tightening", "capital work-in-progress", "TIN", "date of supply", "tax invoice"]) {
  ok(glossSrc.includes(`"${key}":`), `glossary defines "${key}"`);
}
ok(print.includes('"TAX INVOICE" : "Invoice"'), "printed title is TAX INVOICE for VAT-registered businesses");
ok(settings.includes("isValidTin(taxIdNumber)") && settings.includes("Nothing was saved"), "settings refuse a TIN that is not nine digits");

// Buyer TIN lookup (v325)
const custs = [{ name: "Perera Traders", tin: "123456789" }, { name: "Kamal", tin: "12345" }, { name: "No Tin Ltd" }];
ok(tinForCustomer(custs, "perera traders ") === "123456789", "buyer TIN is found by name, ignoring case and spaces");
ok(tinForCustomer(custs, "Kamal") === undefined, "a buyer TIN that is not nine digits is not printed");
ok(tinForCustomer(custs, "No Tin Ltd") === undefined, "a customer without a TIN prints none");
ok(tinForCustomer(custs, "Unknown") === undefined, "an unknown customer prints none");
ok(tinForCustomer(custs, undefined) === undefined, "no customer name prints none");
// Wiring for the buyer TIN and the printed dates (v325)
const printSrc = readFileSync(new URL("../lib/print.ts", import.meta.url), "utf8");
const custSrc = readFileSync(new URL("../app/customers/page.tsx", import.meta.url), "utf8");
const salesSrc = readFileSync(new URL("../app/sales/page.tsx", import.meta.url), "utf8");
const invSrc = readFileSync(new URL("../app/invoices/page.tsx", import.meta.url), "utf8");
const rcvSrc = readFileSync(new URL("../app/receivables/page.tsx", import.meta.url), "utf8");
const rpSrc = readFileSync(new URL("../app/receivables-payables/page.tsx", import.meta.url), "utf8");
ok(printSrc.includes("TIN ${escapeHtml(customerTin)}"), "invoices print the buyer TIN under Bill to");
ok((printSrc.match(/Date of supply:/g) ?? []).length === 2, "both invoice templates print a date of supply (the estimate does not)");
ok((printSrc.match(/Date of invoice:/g) ?? []).length === 2, "both invoice templates print a date of invoice");
ok(printSrc.includes('"TAX INVOICE" : "Invoice"') && printSrc.includes("Subtotal"), "the VAT breakdown lines (subtotal, tax, total) are printed");
ok(custSrc.includes("isValidTin(tin)") && custSrc.includes("Buyer's TIN"), "the customer form takes a TIN and refuses one that is not nine digits");
ok(salesSrc.includes("tinForCustomer(customers") && invSrc.includes("tinForCustomer(customers") && rcvSrc.includes("tinForCustomer(customers") && rpSrc.includes("tinForCustomer(customers"), "every page that prints an invoice passes the buyer TIN");

ok(highestInvoiceSeq(["26NOV_1_00004", "26NOV_1_00009", "INV-000099", undefined]) === 9, "the counter equals the highest number in use, legacy refs ignored");
ok(highestInvoiceSeq([]) === 0, "no invoices means the counter is zero");
ok(readFileSync(new URL("../scripts/restore-from-backup.mjs", import.meta.url), "utf8").includes("never let numbers repeat") || readFileSync(new URL("../scripts/restore-from-backup.mjs", import.meta.url), "utf8").includes("meta\").doc(\"invoiceCounter\")"), "the restore script writes the invoice counter back");
console.log(`\n${failed === 0 ? "All checks passed" : `${failed} FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
