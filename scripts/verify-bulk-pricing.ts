// Quantity pricing (lib/bulkPricing.ts): tier parsing, the deepest tier reached, the discounted unit price and total, the margin left, and the
// margin floor, checked with worked numbers. Run: npx tsx scripts/verify-bulk-pricing.ts
import { parseTiers, discountFor, orderPrice } from "../lib/bulkPricing";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

const { tiers, errors } = parseTiers("50:10, 10:5");
ok(tiers.length === 2 && tiers[0].minQty === 10 && tiers[1].minQty === 50 && errors.length === 0, "tiers are read in any order and kept in quantity order");
ok(parseTiers("10 5, abc:3, 0:5").errors.length === 3, "a tier without the colon, a non-number, or a zero minimum is reported, not guessed");
ok(discountFor(9, tiers) === 0 && discountFor(10, tiers) === 5 && discountFor(60, tiers) === 10, "the deepest tier reached applies: nothing below 10, 5% from 10, 10% from 50");

const one = orderPrice({ qty: 1, listUnitPrice: 200, unitCost: 120, tiers, marginFloorPct: 30 });
ok(one.discountPct === 0 && one.total === 200 && one.marginPct === 40 && one.belowFloor === false, "one unit at list: no discount, total 200, margin 40%, above a 30% floor");
const ten = orderPrice({ qty: 10, listUnitPrice: 200, unitCost: 120, tiers, marginFloorPct: 30 });
ok(ten.discountPct === 5 && ten.unitPrice === 190 && ten.total === 1900 && ten.marginAmount === 700, "ten units at 5% off: unit 190, total 1,900, margin 700");
ok(ten.marginPct === 36.8 && ten.belowFloor === false, "the margin on the discounted price is 36.8%, still above the floor");
const fifty = orderPrice({ qty: 50, listUnitPrice: 200, unitCost: 150, tiers, marginFloorPct: 30 });
ok(fifty.discountPct === 10 && fifty.unitPrice === 180 && fifty.belowFloor === true, "fifty units at 10% off drop the margin to 16.7%, which is below a 30% floor, so it is flagged");
ok(orderPrice({ qty: 1, listUnitPrice: 0, unitCost: 5, tiers: [], marginFloorPct: 0 }).belowFloor === true, "an item with no price has no margin, so it is always flagged");


// Wiring: the tab is for the owner and manager, and the screen records nothing.
import fs from "node:fs";
import { tabsForRole } from "../lib/operations";
const readBp = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
ok(tabsForRole("owner").includes("pricecheck") && tabsForRole("manager").includes("pricecheck") && !tabsForRole("staff").includes("pricecheck"), "quantity pricing is for the owner and manager");
ok(!/addSale|addExpense|updateProduct|addDoc|updateDoc|setDoc/.test(readBp("components/ops/OrderPricePanel.tsx")) && readBp("components/ops/OrderPricePanel.tsx").includes("Nothing is recorded or priced here"), "the price check records and changes nothing");
console.log(`${checks - fails}/${checks} checks passed (with wiring)`);
if (fails) process.exit(1);
