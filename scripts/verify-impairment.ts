// Impairment (lib/calculations.ts computeFixedAssetStatus): a write-down reduces book value from the day it is recorded, the monthly charge in that month
// includes it, it does nothing before its date, it cannot take book value below zero, and it works under both depreciation methods. Worked numbers.
// Run: npx tsx scripts/verify-impairment.ts
import { computeFixedAssetStatus } from "../lib/calculations";
import type { FixedAsset } from "../lib/types";
import { writeDownAsset } from "../lib/impairment";
import fs from "node:fs";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const base: FixedAsset = { id: "a", name: "Press", category: "Equipment", purchaseDate: "2024-01-01", cost: 10000, usefulLifeMonths: 120, createdAt: 0 } as FixedAsset;
const impaired: FixedAsset = { ...base, impairments: [{ date: "2026-06-15", amount: 3000 }] } as FixedAsset;

const before = computeFixedAssetStatus(base, "2026-05-31");
const same = computeFixedAssetStatus(impaired, "2026-05-31");
ok(Math.abs(same.netBookValue - before.netBookValue) < 0.01, "before the write-down's date, book value is unchanged");
const after = computeFixedAssetStatus(impaired, "2026-06-30");
ok(Math.abs(after.netBookValue - (10000 - 2500 - 3000)) < 0.01, "after it: 10,000 less 30 months of depreciation (2,500) less the 3,000 write-down, leaving 4,500");
const plain = computeFixedAssetStatus(base, "2026-06-30");
const juneCharge = (after.accumulatedDepreciation) - (same.accumulatedDepreciation);
ok(Math.abs((after.accumulatedDepreciation - same.accumulatedDepreciation) - (plain.accumulatedDepreciation - before.accumulatedDepreciation + 3000)) < 0.01, "the June charge carries the 3,000 write-down, on top of the usual depreciation for the month");
ok(juneCharge > 3000, "the month the write-down is recorded shows the larger charge");
ok(Math.abs(after.netBookValue - (after.netBookValue)) === 0, "the value is a plain figure, not a division by zero");

const huge: FixedAsset = { ...base, impairments: [{ date: "2026-06-15", amount: 50000 }] } as FixedAsset;
ok(computeFixedAssetStatus(huge, "2026-06-30").netBookValue === 0, "a write-down bigger than the asset cannot take book value below zero");

const future: FixedAsset = { ...base, impairments: [{ date: "2027-06-15", amount: 3000 }] } as FixedAsset;
ok(Math.abs(computeFixedAssetStatus(future, "2026-06-30").netBookValue - plain.netBookValue) < 0.01, "a write-down dated after the as-of day has no effect yet");

const rb: FixedAsset = { ...base, depreciationMethod: "reducing_balance", reducingRatePct: 20 } as FixedAsset;
const rbImp: FixedAsset = { ...rb, impairments: [{ date: "2026-06-15", amount: 3000 }] } as FixedAsset;
const rbPlain = computeFixedAssetStatus(rb, "2026-06-30").netBookValue;
ok(Math.abs((rbPlain - computeFixedAssetStatus(rbImp, "2026-06-30").netBookValue) - 3000) < 0.01, "under reducing balance too, the write-down comes off the book value in full");


const recorded = writeDownAsset(base, { date: "2026-06-15", amount: 3000, reason: "damaged" }, "2026-11-13");
ok(recorded.ok && recorded.impairments.length === 1 && recorded.impairments[0].amount === 3000, "a write-down within the asset's worth is recorded");
ok(!writeDownAsset(base, { date: "2026-06-15", amount: 0, reason: "" }, "2026-11-13").ok, "a write-down of nothing is refused");
ok(!writeDownAsset(base, { date: "2023-06-15", amount: 100 }, "2026-11-13").ok, "a write-down dated before the asset was bought is refused");
ok(!writeDownAsset(base, { date: "2027-06-15", amount: 100 }, "2026-11-13").ok, "a write-down dated in the future is refused");
ok(!writeDownAsset(base, { date: "2026-06-15", amount: 50000 }, "2026-11-13").ok, "a write-down more than the asset is worth that day is refused, with the worth stated");
ok(writeDownAsset(impaired, { date: "2026-07-01", amount: 1000 }, "2026-11-13").ok && (writeDownAsset(impaired, { date: "2026-07-01", amount: 1000 }, "2026-11-13") as { impairments: unknown[] }).impairments.length === 2, "a second write-down is added to the first, not in place of it");
const screen = fs.readFileSync(new URL("../app/assets/page.tsx", import.meta.url), "utf8");
ok(screen.includes("writeDownAsset(") && screen.includes("Record a write-down"), "the fixed assets page records a write-down from the asset card");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
