// Market rates (lib/marketRates.ts, the product form, and the tab): the gap in percent, the position, the flag at 10%, the level band, stale figures,
// items without a price, and the wiring and roles. Worked numbers. Run: npx tsx scripts/verify-market-rates.ts
import fs from "node:fs";
import { priceVsMarket, marketReview } from "../lib/marketRates";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const today = "2026-11-09";

const above = priceVsMarket(1100, 1000);
ok(above.differencePct === 10 && above.position === "above" && above.flagged === true, "a price 10% above the market is above, and flagged");
const below = priceVsMarket(850, 1000);
ok(below.differencePct === -15 && below.position === "below" && below.flagged === true, "a price 15% below the market is below, and flagged");
const level = priceVsMarket(1015, 1000);
ok(level.position === "level" && level.flagged === false, "within 2% of the market is level, and not flagged");
ok(priceVsMarket(1050, 1000).position === "above" && priceVsMarket(1050, 1000).flagged === false, "5% above is above but not flagged");

const r = marketReview([
  { id: "a", name: "Haircut", sellPrice: 1100, marketRate: 1000, marketRateCheckedOn: "2026-10-20" },
  { id: "b", name: "Consult", sellPrice: 500, marketRate: 800, marketRateCheckedOn: "2026-05-01" },   // stale (over 90 days)
  { id: "c", name: "Unpriced", marketRate: 300 },                                                    // market figure but no own price
  { id: "d", name: "No market", sellPrice: 400 },                                                     // no market figure: left out
], today);
ok(r.rows.length === 2 && r.rows[0].name === "Consult", "only items with both a market figure and a price are compared; the largest gap comes first");
ok(r.flagged === 2 && r.stale === 1, "two gaps are flagged, and the one checked over 90 days ago is stale");
ok(r.unpriced === 1, "an item with a market figure but no price of its own is reported, not compared");
ok(marketReview([{ id: "x", name: "No date", sellPrice: 100, marketRate: 90 }], today).stale === 1, "a market figure with no check date is treated as stale");

ok(tabsForRole("owner").includes("marketrates") && tabsForRole("manager").includes("marketrates") && !tabsForRole("staff").includes("marketrates"), "market rates are for the owner and manager");
ok(read("app/products/page.tsx").includes("marketRateCheckedOn: marketRate && Number(marketRate) > 0") && read("app/products/page.tsx").includes("Market rate (optional)"), "the product form takes an optional market rate and sets its check date");
ok(read("components/ops/MarketRatesPanel.tsx").includes("marketReview(") && !/addDoc|updateDoc|setDoc|deleteDoc/.test(read("components/ops/MarketRatesPanel.tsx")), "the market review reads the products and changes nothing");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
