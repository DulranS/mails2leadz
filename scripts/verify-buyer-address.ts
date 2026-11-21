// Buyer's address on tax invoices (v328). Run: tsx scripts/verify-buyer-address.ts
import { readFileSync } from "node:fs";
import { addressForCustomer, tinForCustomer } from "../lib/invoiceNumber";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failed++;
  console.log(`${cond ? "OK" : "FAIL"}: ${label}`);
};

const custs = [
  { name: "Perera Traders", address: "  12 Main St, Colombo 3  ", tin: "123456789" },
  { name: "Kamal", address: "" },
  { name: "No Address Ltd" },
];

ok(addressForCustomer(custs, "perera traders ") === "12 Main St, Colombo 3", "the address is found by name, ignoring case and spaces, and trimmed");
ok(addressForCustomer(custs, "Kamal") === undefined, "an empty address prints nothing");
ok(addressForCustomer(custs, "No Address Ltd") === undefined, "a customer with no address prints nothing");
ok(addressForCustomer(custs, "Unknown") === undefined, "an unknown customer prints nothing");
ok(addressForCustomer(custs, undefined) === undefined, "no customer name prints nothing");
ok(tinForCustomer(custs, "Perera Traders") === "123456789", "the TIN lookup is unchanged");

const print = readFileSync(new URL("../lib/print.ts", import.meta.url), "utf8");
ok((print.match(/customerAddress\?: string;/g) ?? []).length === 2, "both invoice templates take a customer address");
ok((print.match(/customerAddress \? `<br\/>/g) ?? []).length === 2, "both templates print the address under Bill to");
ok(print.includes('.replace(/\\n/g, "<br/>")'), "a multi-line address keeps its line breaks on the invoice");
ok(print.includes("settings: Settings, customerTin?: string, customerAddress?: string"), "printReceivableInvoice passes the address through");
for (const page of ["sales", "invoices", "receivables", "receivables-payables"]) {
  const src = readFileSync(new URL(`../app/${page}/page.tsx`, import.meta.url), "utf8");
  ok(src.includes("addressForCustomer(customers"), `the ${page} screen passes the buyer's address to the invoice`);
}
const sp = readFileSync(new URL("../lib/print.ts", import.meta.url), "utf8");
ok(sp.includes("Bill to:"), "the bill-to block is still printed");

console.log(`\n${failed === 0 ? "All checks passed" : `${failed} FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
