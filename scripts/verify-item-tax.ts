// Per-item tax rate (lib/tax.ts): the shop rate by default, an item's own rate (or 0 for tax-free) when set, and
// identical-to-before numbers when no item sets one. Hand-worked numbers.
// Run: npx tsx scripts/verify-item-tax.ts
import { describeTaxRates, invoiceLineTaxes, shopTaxRatePct, taxFor, taxRatePctFor } from "../lib/tax";
import { allocateLineTax } from "../lib/delivery";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;
const on = { salesTaxEnabled: true, salesTaxRatePct: 18 };
const off = { salesTaxEnabled: false, salesTaxRatePct: 18 };

// --- The rate.
ok(shopTaxRatePct(on) === 18 && shopTaxRatePct(off) === 0, "shop rate is 18% when on, 0 when off");
ok(shopTaxRatePct({ salesTaxEnabled: true }) === 0, "tax on but no rate set => 0");
ok(taxRatePctFor(undefined, on) === 18 && taxRatePctFor(null, on) === 18 && taxRatePctFor({}, on) === 18, "no item / no override => the shop rate");
ok(taxRatePctFor({ taxRatePct: 8 }, on) === 8, "an item's own rate wins");
ok(taxRatePctFor({ taxRatePct: 0 }, on) === 0, "0 means tax-free, NOT 'use the shop rate'");
ok(taxRatePctFor({ taxRatePct: 8 }, off) === 0 && taxRatePctFor({ taxRatePct: 0 }, off) === 0, "sales tax off => 0 whatever the item says");
ok(taxRatePctFor({ taxRatePct: null }, on) === 18, "a null override (cleared) => the shop rate");
ok(taxRatePctFor({ taxRatePct: -5 }, on) === 18 && taxRatePctFor({ taxRatePct: 101 }, on) === 18 && taxRatePctFor({ taxRatePct: NaN }, on) === 18, "an unusable override is ignored, not trusted");
ok(taxRatePctFor({ taxRatePct: 100 }, on) === 100, "100% is the upper limit");

// --- Amounts.
ok(near(taxFor(1000, { taxRatePct: 8 }, on), 80) && near(taxFor(1000, undefined, on), 180) && taxFor(1000, { taxRatePct: 0 }, on) === 0 && taxFor(1000, undefined, off) === 0, "1,000 at 8%, shop 18%, tax-free, tax off");

// --- Invoice lines: each at its own rate; a delivery line (no item) at the shop rate.
const lines = [{ amount: 1000, item: { taxRatePct: 8 } }, { amount: 2000 }, { amount: 500, item: { taxRatePct: 0 } }, { amount: 300, item: undefined }];
const inv = invoiceLineTaxes(lines, on);
ok(inv.perLine.length === 4 && near(inv.perLine[0], 80) && near(inv.perLine[1], 360) && inv.perLine[2] === 0 && near(inv.perLine[3], 54), "per line: 80, 360, 0, 54");
ok(near(inv.total, 494) && near(inv.total, inv.perLine.reduce((a, b) => a + b, 0)), "total is exactly the sum of the lines");
ok(invoiceLineTaxes(lines, off).total === 0, "tax off => no tax on any line");
ok(invoiceLineTaxes([], on).total === 0 && invoiceLineTaxes([], on).perLine.length === 0, "no lines => nothing");

// --- Nothing changes for a business that never sets an item rate: identical to the old 'one total, split by share'.
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
let identical = true;
for (let t = 0; t < 400; t++) {
  const n = 1 + Math.floor(rnd() * 6);
  const amounts = Array.from({ length: n }, () => Math.round(rnd() * 500000) / 100);
  const rate = [0, 5, 8, 15, 18][Math.floor(rnd() * 5)];
  const settings = { salesTaxEnabled: true, salesTaxRatePct: rate };
  const oldTotal = amounts.reduce((a, b) => a + b, 0) * (rate / 100);
  const oldSplit = allocateLineTax(amounts, oldTotal);
  const next = invoiceLineTaxes(amounts.map((a) => ({ amount: a })), settings);
  if (!near(next.total, oldTotal, 1e-6)) identical = false;
  for (let i = 0; i < n; i++) if (!near(next.perLine[i], oldSplit[i], 1e-6)) identical = false;
}
ok(identical, "400 random invoices with no item overrides: every line and the total match the old split to a millionth");

// --- Describing the rate on a summary line.
ok(describeTaxRates([18, 18, 18]) === "18%" && describeTaxRates([8]) === "8%" && describeTaxRates([18, 0]) === "mixed rates" && describeTaxRates([]) === "", "one rate, mixed, none");
ok(describeTaxRates([18, 18.00001]) === "18%", "rates that differ only by float noise count as one");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
