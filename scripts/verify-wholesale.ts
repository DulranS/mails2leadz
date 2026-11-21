// Wholesale price suggestion (lib/wholesale.ts). Hand-worked numbers.
// Run: npx tsx scripts/verify-wholesale.ts
import { shouldOfferWholesale, wholesaleEntryPrice } from "../lib/wholesale";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

ok(wholesaleEntryPrice(80, 1) === 80, "per piece: 80 stays 80");
ok(wholesaleEntryPrice(80, 12) === 960, "a pack of 12 at 80 a piece is 960");
ok(wholesaleEntryPrice(33.333, 3) === 100, "rounded to the cent: 3 x 33.333 = 99.999 -> 100.00");
ok(wholesaleEntryPrice(0.125, 10) === 1.25, "fractional prices scale: 10 x 0.125 = 1.25");
ok(wholesaleEntryPrice(undefined, 1) === undefined && wholesaleEntryPrice(null, 1) === undefined && wholesaleEntryPrice(0, 1) === undefined && wholesaleEntryPrice(-5, 1) === undefined && wholesaleEntryPrice(NaN, 1) === undefined, "no usable wholesale price => no suggestion");
ok(wholesaleEntryPrice(80, 0) === 80 && wholesaleEntryPrice(80, NaN) === 80 && wholesaleEntryPrice(80, -2) === 80, "a nonsense pack size falls back to one piece, never a wrong price");

ok(shouldOfferWholesale(960, 1000) === true, "typed price differs => offer");
ok(shouldOfferWholesale(960, 960) === false && shouldOfferWholesale(960, 960.004) === false, "already at the wholesale price (to the cent) => do not offer");
ok(shouldOfferWholesale(960, 960.01) === true, "a cent away still offers");
ok(shouldOfferWholesale(undefined, 100) === false, "no suggestion => nothing to offer");
ok(shouldOfferWholesale(960, NaN) === true && shouldOfferWholesale(960, 0) === true, "an empty or invalid typed price still gets the suggestion");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
