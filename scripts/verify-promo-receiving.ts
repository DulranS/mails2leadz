// Promo codes (lib/promoCodes.ts) and receiving variance (lib/receiving.ts): parsing, the lower price, the amount a code took
// off, the usage totals, and the short/over flag on a delivery, with hand-worked figures; plus the wiring.
// Run: npx tsx scripts/verify-promo-receiving.ts
import fs from "node:fs";
import { findPromoPercent, formatPromoCodes, parsePromoCodes, promoOff, promoUsage, promotedPrice } from "../lib/promoCodes";
import { receiptVariance } from "../lib/receiving";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

const good = parsePromoCodes("save10:10, WELCOME:5%");
ok(!good.error && good.codes.SAVE10 === 10 && good.codes.WELCOME === 5, "codes are upper-cased and an optional % sign is allowed");
ok(formatPromoCodes(good.codes) === "SAVE10:10, WELCOME:5", "codes format back the way they are typed");
ok(parsePromoCodes("").codes && Object.keys(parsePromoCodes("").codes).length === 0 && !parsePromoCodes("").error, "an empty box is no codes, not an error");
ok(!!parsePromoCodes("SAVE10").error, "a code without a percent is refused");
ok(!!parsePromoCodes("SAVE10:0").error && !!parsePromoCodes("SAVE10:101").error, "a percent must be above 0 and at most 100");
ok(!!parsePromoCodes("SAVE 10:10").error, "a code with a space is refused");
ok(!!parsePromoCodes("A:10, a:5").error, "the same code listed twice is refused");
ok(!!parsePromoCodes(Array.from({ length: 31 }, (_, i) => `C${i}:1`).join(",")).error, "at most thirty codes");
ok(parsePromoCodes("CONSTRUCTOR:5").codes.CONSTRUCTOR === 5, "a code named like an object property is still a code");

ok(findPromoPercent(good.codes, " save10 ") === 10, "a typed code is matched ignoring case and spaces");
ok(findPromoPercent(good.codes, "NOPE") === null && findPromoPercent(undefined, "SAVE10") === null, "an unknown code or no codes gives no discount");

ok(promotedPrice(250, 10) === 225 && promotedPrice(99.99, 15) === 84.99, "10 percent off 250 is 225; 15 percent off 99.99 is 84.99");
ok(promoOff(250, 225, 2) === 50, "two items at 25 off each took 50 off");
ok(promoOff(100, 120, 1) === 0, "a price that went up is never a discount");

const sales = [
  { date: "2026-10-03", promoCode: "SAVE10", promoOffAmount: 25 },
  { date: "2026-10-10", promoCode: "WELCOME", promoOffAmount: 10 },
  { date: "2026-10-12" },
  { date: "2026-09-30", promoCode: "SAVE10", promoOffAmount: 999 },
  { date: "2026-10-20", promoCode: "SAVE10", promoOffAmount: 15 },
];
const u = promoUsage(sales, "2026-10-01", "2026-10-31");
ok(u.uses === 3 && u.off === 50, "October: three sales used codes and took off 25 + 10 + 15 (September is left out)");
ok(u.rows[0].code === "SAVE10" && u.rows[0].uses === 2 && u.rows[0].off === 40, "SAVE10 was used twice for 40 off, and is listed first");
ok(promoUsage([{ date: "2026-10-03" }], "2026-10-01", "2026-10-31").uses === 0, "no codes used gives zero, not an error");

ok(receiptVariance(10, 8).kind === "short" && receiptVariance(10, 8).units === 2, "8 received of 10 ordered is short by 2");
ok(receiptVariance(10, 12).kind === "over" && receiptVariance(10, 12).units === 2, "12 received of 10 ordered is over by 2");
ok(receiptVariance(10, 10).kind === "exact", "10 of 10 is exact");
ok(receiptVariance(10, undefined).kind === "none", "an order not yet received has no variance");
ok(receiptVariance(2.5, 2.2).kind === "short" && receiptVariance(2.5, 2.2).units === 0.3, "fractional quantities are compared without rounding errors");

const quick = fs.readFileSync("components/QuickForms.tsx", "utf8");
ok(/promoCode: promoApplied && promoText\.trim\(\) \?/.test(quick), "the sale form saves the promo code only when it was applied");
ok(/promoOffAmount: promoApplied/.test(quick), "the sale form saves what the code took off");
ok(/txCurrency === settings\.currency && Object\.keys\(settings\.promoCodes/.test(quick), "promo codes are offered only in the shop currency");
const settings = fs.readFileSync("app/settings/page.tsx", "utf8");
ok(/promoCodes: promo\.codes/.test(settings) && /parsePromoCodes\(promoText\)/.test(settings), "settings save the promo codes and refuse a bad list");
const sp = fs.readFileSync("app/sales/page.tsx", "utf8");
ok(/<PromoUsageCard sales=\{sales\} economics=\{saleEconomics\} spend=\{settings\.campaignSpend\} currency=\{currency\} \/>/.test(sp), "the Sales page shows the promo campaign card");
const po = fs.readFileSync("app/purchase-orders/page.tsx", "utf8");
ok(/receivingNote: receivingNote\.trim\(\) \|\| undefined/.test(po), "the receive form saves the delivery note");
ok(/<ReceiptFlag po=\{po\} \/>/.test(po), "the purchase orders list shows the short or over flag");
const ctx = fs.readFileSync("contexts/DataContext.tsx", "utf8");
ok(/receivingNote: receipt\.receivingNote\?\.trim\(\) \|\| undefined/.test(ctx), "receiving stores the delivery note on the order");
ok(/"promoCode", "promoOffAmount"\]/.test(ctx), "clearing a promo code on a sale removes it");

console.log(`verify-promo-receiving: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
