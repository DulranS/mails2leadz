// Productizing (lib/productize.ts and the offer form): the price that leaves a wanted margin, the margin a chosen price leaves, the starting templates,
// and the wiring into the offer form. Worked numbers. Run: npx tsx scripts/verify-productize.ts
import fs from "node:fs";
import { suggestPrice, offerMargin, OFFER_TEMPLATES } from "../lib/productize";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(suggestPrice(600, 40) === 1000, "a cost of 600 at a 40% margin is priced at 1,000 (600 / 0.6)");
ok(suggestPrice(0, 30) === 0, "an offer that costs nothing to deliver is priced at zero, which is the honest answer");
ok(suggestPrice(600, 100) === null && suggestPrice(600, -5) === null, "a margin of 100% or more, or below zero, has no price, and is refused");
const m = offerMargin(1000, 600);
ok(m.profit === 400 && m.marginPct === 40, "a price of 1,000 on a cost of 600 leaves 400 profit, a 40% margin");
ok(offerMargin(0, 0).marginPct === null, "with no price, there is no margin to show");
ok(OFFER_TEMPLATES.length === 4 && OFFER_TEMPLATES.every((t) => t.name && t.costLabels.length > 0), "four starting templates, each with a name and the cost lines to fill in");
const sessions = OFFER_TEMPLATES.find((t) => t.key === "sessions")!;
ok(sessions.capacityPerDelivery === 10 && sessions.capacityUnit === "sessions", "the sessions template sets ten sessions by default");

const form = read("app/offers/page.tsx");
ok(form.includes("OFFER_TEMPLATES.map") && form.includes("suggestPrice(") && form.includes("offerMargin("), "the offer form offers templates, a suggested price and the margin as it is typed");
ok(read("lib/types.ts").includes("recipeLines"), "an offer keeps its cost lines, which the margin is worked out from");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
