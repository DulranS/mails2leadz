// Stock count (lib/stockCount.ts + recordStockCount in DataContext). Hand-worked numbers and source checks.
// Run: npx tsx scripts/verify-stock-count.ts
import fs from "node:fs";
import { parseCounted, countVariance, planStockCount, varianceValue, MAX_COUNT_LINES } from "../lib/stockCount";
import { PERIOD_GUARDED_METHODS } from "../lib/periodGuards";
import { isMutationName } from "../lib/readOnlyGuard";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

// Typing.
ok(parseCounted("", false).value === null && !parseCounted("", false).error && parseCounted("   ", true).value === null, "blank = not counted (not zero)");
ok(parseCounted("0", false).value === 0, "0 is a real count: the shelf is empty");
ok(parseCounted("12", false).value === 12 && parseCounted(" 12 ", false).value === 12, "whole numbers, trimmed");
ok(!!parseCounted("2.5", false).error && parseCounted("2.5", true).value === 2.5, "decimals only for items sold by fraction");
ok(!!parseCounted("-1", true).error && !!parseCounted("abc", true).error && !!parseCounted("1e3", true).error && !!parseCounted("1,5", true).error, "negatives, text, exponents and commas are refused");
ok(parseCounted("0.12345", true).value === 0.1235, "rounded to 4 decimals");

// Variance: counted minus the books.
ok(countVariance(10, 7) === -3 && countVariance(10, 12) === 2 && countVariance(10, 10) === 0, "short 3, found 2, equal 0");
ok(countVariance(10, null) === null && countVariance(NaN, 5) === null, "not counted or bad stock: no variance");
ok(countVariance(0.3, 0.1 + 0.2) === 0, "float noise is not a difference");
ok(countVariance(5, 0) === -5, "counted zero against 5 is short 5");

// Plan: only counted AND different items become adjustments.
const plan = planStockCount([
  { productId: "a", counted: 7, system: 10 },
  { productId: "b", counted: 10, system: 10 },
  { productId: "c", counted: null, system: 4 },
  { productId: "d", counted: 3, system: 1 },
  { productId: "a", counted: 99, system: 10 },
]);
ok(plan.adjustments.length === 2 && plan.adjustments[0].productId === "a" && plan.adjustments[0].qty === -3 && plan.adjustments[1].productId === "d" && plan.adjustments[1].qty === 2, "a short 3 and a found 2; matching and uncounted are left alone; a repeated item counts once");
ok(plan.counted === 3 && plan.matching === 1, "3 counted, 1 matching");
ok(planStockCount([]).adjustments.length === 0, "nothing counted: nothing to do");
const many = Array.from({ length: MAX_COUNT_LINES + 1 }, (_, i) => ({ productId: `p${i}`, counted: 0, system: 1 }));
let threw = false;
try { planStockCount(many); } catch { threw = true; }
ok(threw, `more than ${MAX_COUNT_LINES} differences in one batch is refused in words`);
ok(planStockCount(many.slice(0, MAX_COUNT_LINES)).adjustments.length === MAX_COUNT_LINES, `exactly ${MAX_COUNT_LINES} is fine`);

// Value.
ok(varianceValue(-3, 12.5) === -37.5 && varianceValue(2, 0.333) === 0.67 && varianceValue(null, 5) === null, "value of a difference at average cost");

// Source checks: recorded in one batch, against live stock, as ordinary count-correction adjustments, guarded.
const dc = fs.readFileSync("contexts/DataContext.tsx", "utf8");
const body = dc.slice(dc.indexOf("recordStockCount: async"), dc.indexOf("deleteStockAdjustment: async"));
ok(body.length > 400, "recordStockCount is implemented");
ok(isMutationName("recordStockCount"), "its name is covered by the Accountant read-only guard");
ok(typeof PERIOD_GUARDED_METHODS.recordStockCount === "function", "it is in the closed-month guard table");
ok(/requirePermission\("manage:products"\)/.test(body), "needs the same permission as a single adjustment");
ok(/planStockCount\(/.test(body) && /ledgers\.get\(/.test(body) && /locationStockLevels/.test(body), "differences are worked out inside, from live stock (consolidated or the chosen location)");
ok(/const system = locationId\s*\?\s*locationStockLevels\.find\(\(l\) => l\.productId === c\.productId && l\.locationId === locationId\)\?\.qtyOnHand \?\? 0\s*:\s*ledgers\.get\(c\.productId\)\?\.qtyOnHand \?\? 0;/.test(body), "with several locations the books figure is the chosen location's; otherwise the consolidated stock");
ok(/const locationId = multiLocation \? opts\?\.locationId \|\| undefined : undefined;/.test(body), "a location is only used when the business has more than one");
ok(/reason: "count_correction"/.test(body), "recorded as count-correction adjustments (never revenue or cost of goods; they reach profit as stock shrinkage, which verify-business-models pins)");
ok(/writeBatch\(db\)/.test(body) && /batch\.commit\(\)/.test(body) && (body.match(/batch\.set\(/g) ?? []).length === 1, "all adjustments are saved in one batch");
ok(/product\.type !== "product"|type === "service"/.test(body), "services are refused (they have no stock)");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
