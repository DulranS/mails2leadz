// Quantity price breaks (lib/priceTiers.ts). Hand-worked.
// Run: npx tsx scripts/verify-price-tiers.ts
import { cleanTiers, parseTiers, formatTiers, tierBasePrice, tierEntryPrice } from "../lib/priceTiers";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const t = parseTiers("50:80, 10:90");
ok(!t.error && t.tiers.length === 2 && t.tiers[0].minQty === 10 && t.tiers[1].minQty === 50, "parsed and sorted by quantity");
ok(formatTiers(t.tiers) === "10:90, 50:80", "formats back the same way");
ok(parseTiers("10:90;50:80\n100=70").tiers.length === 3, "accepts ; and new lines and =");
ok(parseTiers("").tiers.length === 0 && !parseTiers("").error && !parseTiers("  ,, ").error, "empty is fine: no breaks");
ok(!!parseTiers("ten:90").error && !!parseTiers("10").error && !!parseTiers("10:-5").error && !!parseTiers("0:5").error && !!parseTiers("10:0").error, "malformed or non-positive entries are reported");
ok(!!parseTiers("10:90, 10:80").error, "a repeated quantity is reported");
ok(!!parseTiers("1:9,2:9,3:9,4:9,5:9,6:9,7:9,8:9,9:9").error, "more than 8 breaks is reported");
ok(parseTiers("2.5:90").tiers[0].minQty === 2.5, "fractional quantities are allowed (items sold by weight)");

const tiers = [{ minQty: 10, unitPrice: 90 }, { minQty: 50, unitPrice: 80 }];
ok(tierBasePrice(tiers, 9) === undefined, "below the first break: usual price");
ok(tierBasePrice(tiers, 10) === 90 && tierBasePrice(tiers, 49) === 90, "10 to 49: 90");
ok(tierBasePrice(tiers, 50) === 80 && tierBasePrice(tiers, 500) === 80, "50 and over: 80");
ok(tierBasePrice(tiers, 0) === undefined && tierBasePrice(tiers, NaN) === undefined && tierBasePrice(tiers, -4) === undefined, "no or invalid quantity: nothing");
ok(tierBasePrice(undefined, 100) === undefined && tierBasePrice([], 100) === undefined && tierBasePrice(null, 100) === undefined, "no tiers: nothing");
// Packs: 12 pieces per pack, qty entered 5 packs = 60 pieces -> the 50-break (80 per piece) -> 960 per pack.
ok(tierEntryPrice(tiers, 60, 12) === 960, "5 packs of 12 = 60 pieces reaches the 50 break: 960 per pack");
ok(tierEntryPrice(tiers, 24, 12) === 1080, "2 packs = 24 pieces is the 10 break: 1080 per pack");
ok(tierEntryPrice(tiers, 5, 12) === undefined, "5 pieces: no break");
// Stored junk is dropped, not crashed on.
const c = cleanTiers([{ minQty: 10, unitPrice: 90 }, { minQty: "x", unitPrice: 5 }, null, { minQty: 5, unitPrice: -1 }, { minQty: 10, unitPrice: 85 }, { minQty: 3, unitPrice: 95 }]);
ok(c.length === 2 && c[0].minQty === 3 && c[1].minQty === 10 && c[1].unitPrice === 90, "bad and duplicate rows dropped, sorted");
ok(cleanTiers("nope").length === 0 && cleanTiers(undefined).length === 0, "non-array stored value gives none");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
