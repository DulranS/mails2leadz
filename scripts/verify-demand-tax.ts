// Waitlist, backorders and tax-exempt customers. Run: npx tsx scripts/verify-demand-tax.ts
import { validateLogEntry } from "../lib/businessLog";
import { customerIsTaxExempt, taxFor, taxRatePctFor, invoiceLineTaxes } from "../lib/tax";
import { deliveryTaxFor } from "../lib/delivery";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const TODAY = "2026-11-03";
const settings = { salesTaxEnabled: true, salesTaxRatePct: 15 };

ok(validateLogEntry({ kind: "waitlist", title: "Dinner for 4", party: "Amal", status: "waiting" }, TODAY) === null, "a waitlist entry needs a name");
ok(validateLogEntry({ kind: "waitlist", title: "Dinner for 4", party: "A" }, TODAY) !== null, "a waitlist name must be real");
ok(validateLogEntry({ kind: "waitlist", title: "Dinner", party: "Amal", status: "ordered" }, TODAY) !== null, "an unknown waitlist status is refused");
ok(validateLogEntry({ kind: "backorder", title: "Blue mug", party: "Amal", qty: 3 }, TODAY) === null, "a backorder needs an item, a customer and a quantity");
ok(validateLogEntry({ kind: "backorder", title: "Blue mug", party: "Amal", qty: 0 }, TODAY) !== null, "a backorder quantity is at least 1");
ok(validateLogEntry({ kind: "backorder", title: "Blue mug", party: "Amal", qty: 2, status: "shipped" }, TODAY) !== null, "an unknown backorder status is refused");

const exempt = [{ name: "Ceylon Hotels", taxExempt: true }, { name: "Amal" }];
ok(customerIsTaxExempt(exempt, "  ceylon hotels ") && !customerIsTaxExempt(exempt, "Amal") && !customerIsTaxExempt(exempt, undefined), "a tax-exempt customer is matched by name, ignoring case and spaces");
ok(taxRatePctFor({ taxRatePct: 10 }, settings, true) === 0, "an exempt customer's line is taxed at zero, even at an item's own rate");
ok(taxFor(100, undefined, settings, true) === 0 && taxFor(100, undefined, settings) === 15, "tax is zero for an exempt customer and the shop rate otherwise");
ok(invoiceLineTaxes([{ amount: 100 }, { amount: 50 }], settings, true).total === 0, "an exempt invoice carries no tax on any line");
ok(deliveryTaxFor(40, settings, true) === 0 && deliveryTaxFor(40, settings) === 6, "delivery is untaxed for an exempt customer");
ok(taxRatePctFor({ taxRatePct: 10 }, { salesTaxEnabled: false, salesTaxRatePct: 15 }) === 0, "with sales tax off, nothing is charged (unchanged)");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
