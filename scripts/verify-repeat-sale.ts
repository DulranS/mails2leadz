// Sell again (lib/repeatSale.ts): what a repeat carries over and what it leaves behind, with hand-worked cases; plus the
// wiring on the Sales page. Run: npx tsx scripts/verify-repeat-sale.ts
import fs from "node:fs";
import { repeatSaleInitial } from "../lib/repeatSale";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

const past = {
  productId: "P1", qty: 3, unitPrice: 1200, customer: "Kamal", paymentMethod: "credit" as const,
};
const r = repeatSaleInitial(past)!;
ok(r.productId === "P1" && r.qty === 3 && r.unitPrice === 1200, "the same item, quantity and price come across");
ok(r.customer === "Kamal" && r.paymentMethod === "credit", "the customer and how they pay come across");
ok(!("date" in r) && !("notes" in r) && !("serialNo" in r) && !("invoiceId" in r) && !("projectId" in r), "the date, notes, serial, project and invoice are left behind");

ok(repeatSaleInitial({ productId: "P2", qty: 1, unitPrice: 5 })!.paymentMethod === "cash", "a sale with no payment method repeats as cash");
ok(repeatSaleInitial({ productId: "P2", qty: 1, unitPrice: 5, customer: "" })!.customer === undefined, "a blank customer is not carried as blank");

const delivery = repeatSaleInitial({ productId: "D", qty: 1, unitPrice: 300, isDelivery: true });
ok(delivery === null, "a delivery line on its own is not repeated");

const foreign = repeatSaleInitial({ productId: "P3", qty: 2, unitPrice: 330, currency: "USD", foreignUnitPrice: 100 })!;
ok(foreign.currency === "USD" && foreign.unitPrice === 100, "a foreign-currency sale repeats in its own currency and price");
const local = repeatSaleInitial({ productId: "P3", qty: 2, unitPrice: 330, currency: "LKR" })!;
ok(local.currency === undefined && local.unitPrice === 330, "a sale with no foreign price repeats in the base currency at its base price");

const sales = fs.readFileSync("app/sales/page.tsx", "utf8");
ok(/Sell again/.test(sales), "the sales list offers a Sell again action");
ok(/repeatSaleInitial\(/.test(sales) && /initial=\{/.test(sales), "the sale form is prefilled from the chosen sale");
ok(/key=\{editing\?\.id \?\? repeatFrom\?\.id/.test(sales) || /key=\{repeatFrom/.test(sales), "the form resets for each repeat");
const staffPart = sales.slice(sales.indexOf("function StaffSalesView()"));
ok((staffPart.match(/Sell again/g) ?? []).length === 2, "the staff list offers Sell again on the card and the table row");
ok(/openRepeat\(s\)/.test(staffPart) && /key=\{repeatFrom\?\.id \?\? "new"\}/.test(staffPart), "staff repeat prefills the form and resets it");
ok(/setRepeatFrom\(null\); setModalOpen\(true\);/.test(staffPart), "a new sale from the staff page is not prefilled");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exitCode = 1;
