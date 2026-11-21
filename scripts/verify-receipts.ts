// Receipts on expenses (lib/receipts.ts, v332). Run: tsx scripts/verify-receipts.ts
import { readFileSync } from "node:fs";
import { validateReceiptFile, receiptStoragePath, RECEIPT_MAX_BYTES } from "../lib/receipts";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failed++;
  console.log(`${cond ? "OK" : "FAIL"}: ${label}`);
};

ok(validateReceiptFile({ type: "image/jpeg", size: 200_000 }) === null, "a JPG under 5 MB is accepted");
ok(validateReceiptFile({ type: "image/png", size: 1000 }) === null, "a PNG is accepted");
ok(validateReceiptFile({ type: "image/webp", size: 1000 }) === null, "a WebP is accepted");
ok(validateReceiptFile({ type: "application/pdf", size: 900_000 }) === null, "a PDF is accepted");
ok(validateReceiptFile({ type: "image/gif", size: 1000 }) !== null, "a GIF is refused");
ok(validateReceiptFile({ type: "text/html", size: 1000 }) !== null, "an HTML file is refused");
ok(validateReceiptFile({ type: "application/pdf", size: RECEIPT_MAX_BYTES }) === null, "exactly 5 MB is accepted");
ok(validateReceiptFile({ type: "application/pdf", size: RECEIPT_MAX_BYTES + 1 }) !== null, "just over 5 MB is refused");
ok(validateReceiptFile({ type: "image/png", size: 0 }) !== null, "an empty file is refused");
ok(validateReceiptFile({ type: "image/png", size: NaN }) !== null, "an unknown size is refused");
ok(validateReceiptFile(null) !== null, "no file is refused");

ok(receiptStoragePath("biz_123", "rcpt-ABC_9") === "receipts/biz_123/rcpt-ABC_9", "the path is receipts/{business}/{receipt}");
let threw = false;
try { receiptStoragePath("../other", "x"); } catch { threw = true; }
ok(threw, "a business id that could leave the folder is refused");
threw = false;
try { receiptStoragePath("biz", "a/b"); } catch { threw = true; }
ok(threw, "a receipt id with a slash is refused");

const rules = readFileSync(new URL("../storage.rules", import.meta.url), "utf8");
const block = rules.slice(rules.indexOf("match /receipts/{businessId}/{receiptId}"), rules.indexOf("match /logos/"));
ok(block.includes("request.resource.size < 5 * 1024 * 1024"), "storage rule caps the size at 5 MB");
ok(block.includes("'application/pdf'") && block.includes("'image/webp'"), "storage rule lists the four allowed types");
ok(block.includes("data.role == 'manager'") && block.includes("data.active == true"), "storage rule lets only the owner or an active manager write");
ok(!block.includes("allow write: if request.auth != null\n                   && request.resource.size") || block.includes("request.auth.uid == businessId"), "the write rule is tied to the owner or a manager");
const form = readFileSync(new URL("../app/expenses/page.tsx", import.meta.url), "utf8");
ok(form.includes("uploadReceipt(businessId, receiptFile)"), "the expense form uploads the receipt before saving");
ok(form.includes("View receipt") && form.includes("Receipt (optional)"), "the expense form shows the receipt and the field");
ok(form.includes("receiptUnlinked") && form.includes("unlinked when you save"), "removing a receipt is explicit and says so");
const types = readFileSync(new URL("../lib/types.ts", import.meta.url), "utf8");
ok(types.includes("receiptPath?: string;"), "the Expense type holds the receipt path");

console.log(`\n${failed === 0 ? "All checks passed" : `${failed} FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
