// Farm batches (lib/farm.ts): alive counts, survival, biomass, feed conversion, harvest, cost per kg, water flags, and the wiring.
// Run: npx tsx scripts/verify-farm.ts
import fs from "node:fs";
import { batchStats, cleanEntry, livePopulation, mortalityAlert, validateBatchInput, validateEntryInput, waterFlags, type BatchInput } from "../lib/farm";
import type { FarmBatch, FarmEntry } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const today = "2026-11-02";
let n = 0;
const en = (o: Partial<FarmEntry> & Pick<FarmEntry, "kind" | "date">): FarmEntry => ({ id: "e" + n++, ...o });
const batch = (entries: FarmEntry[], o: Partial<FarmBatch> = {}): FarmBatch => ({ id: "b", name: "Cage 3", species: "Atlantic salmon", startDate: "2026-06-01", startCount: 1000, startAvgWeightG: 100, status: "active", entries, createdAt: 1, updatedAt: 1, ...o });

// ---- batch validation ----
const bi: BatchInput = { name: "Cage 3", species: "Salmon", startDate: "2026-06-01", startCount: 1000, startAvgWeightG: 100, status: "active" };
ok(validateBatchInput(bi) === null, "a normal batch is accepted");
ok(validateBatchInput({ ...bi, startCount: 0 }) !== null && validateBatchInput({ ...bi, startCount: 10.5 }) !== null && validateBatchInput({ ...bi, startCount: -3 }) !== null, "stocking count is a whole number above zero");
ok(validateBatchInput({ ...bi, startAvgWeightG: 0 }) !== null && validateBatchInput({ ...bi, startDate: "x" }) !== null && validateBatchInput({ ...bi, name: "a" }) !== null, "weight, date and name are required");
ok(validateBatchInput({ ...bi, tempMinC: 20, tempMaxC: 10 }) !== null && validateBatchInput({ ...bi, phMin: 9, phMax: 7 }) !== null, "ranges must be in order");

// ---- population, survival, biomass ----
const b1 = batch([
  en({ kind: "mortality", date: "2026-06-10", count: 20 }), en({ kind: "cull", date: "2026-06-12", count: 10 }),
  en({ kind: "transfer_in", date: "2026-07-01", count: 100, avgWeightG: 200 }),
  en({ kind: "sample", date: "2026-08-01", avgWeightG: 800 }), en({ kind: "sample", date: "2026-10-01", avgWeightG: 2500 }),
  en({ kind: "feed", date: "2026-07-05", kg: 1000 }), en({ kind: "feed", date: "2026-08-05", kg: 1500.5 }),
  en({ kind: "harvest", date: "2026-10-20", count: 200, kg: 560 }),
  en({ kind: "cost", date: "2026-06-01", amount: 300000, label: "Smolts" }), en({ kind: "cost", date: "2026-08-01", amount: 20000.5, label: "Labour" }),
]);
const s = batchStats(b1, today);
ok(livePopulation(b1) === 870 && s.alive === 870, "alive = stocked + added - deaths - culled - harvested (1000+100-20-10-200)");
ok(s.stocked === 1100 && s.mortality === 20 && s.culled === 10 && s.harvestedCount === 200, "totals");
ok(s.survivalPct === 97.3, "survival = (stocked - deaths - culled) / stocked = 1070/1100");
ok(s.avgWeightG === 2500 && s.weightDate === "2026-10-01", "the latest sample sets the average weight, whatever order they were entered");
ok(s.biomassKg === 2175, "biomass = 870 alive x 2500 g");
ok(s.feedKg === 2500.5 && s.harvestKg === 560 && s.totalCost === 320000.5, "feed, harvest and typed costs add up");
// gain = biomass 2175 + harvested 560 - start 100 - added 20 = 2615
ok(s.gainKg === 2615, "growth = biomass now + harvested - stocked - added (2175+560-100-20)");
ok(s.fcr === 0.96, "feed conversion = feed / growth (2500.5 / 2615)");
ok(s.costPerKgHarvested === 571.43, "cost per kg harvested = typed costs / kg harvested");
ok(s.daysIn === 154, "days since stocking");

// ---- early batch ----
const b0 = batch([]);
const s0 = batchStats(b0, "2026-06-01");
ok(s0.alive === 1000 && s0.survivalPct === 100 && s0.fcr === null && s0.costPerKgHarvested === null && s0.biomassKg === 100 && s0.daysIn === 0, "a new batch: nothing lost, no ratio until there is growth");
ok(batchStats(batch([en({ kind: "feed", date: "2026-06-05", kg: 50 })]), today).fcr === null, "feed with no growth gives no ratio, not a divide-by-zero");
ok(batchStats(batch([en({ kind: "sample", date: "2026-07-01", avgWeightG: 50 }), en({ kind: "feed", date: "2026-07-02", kg: 10 })]), today).fcr === null, "weight loss gives no ratio");

// ---- entry validation ----
const v = (e: any, b = b1) => validateEntryInput({ date: "2026-10-30", ...e }, b, today);
ok(v({ kind: "mortality", count: 5 }) === null && v({ kind: "mortality", count: 0 }) !== null && v({ kind: "mortality", count: 2.5 }) !== null, "deaths: whole number above zero");
ok(v({ kind: "mortality", count: 871 }) !== null && v({ kind: "mortality", count: 870 }) === null, "cannot lose more than are alive");
ok(v({ kind: "harvest", count: 900, kg: 5 }) !== null && v({ kind: "harvest", count: 10 }) !== null && v({ kind: "harvest", count: 10, kg: 30 }) === null, "harvest needs a count within those alive and a weight");
ok(v({ kind: "feed", kg: 0 }) !== null && v({ kind: "feed", kg: 25 }) === null, "feed above zero");
ok(v({ kind: "sample", avgWeightG: 0 }) !== null && v({ kind: "sample", avgWeightG: 2600 }) === null, "sample weight above zero");
ok(v({ kind: "transfer_in", count: 10 }) !== null && v({ kind: "transfer_in", count: 10, avgWeightG: 300 }) === null, "added animals need a weight");
ok(v({ kind: "cost", amount: 100 }) !== null && v({ kind: "cost", amount: 100, label: "Net repair" }) === null, "a cost needs a reason");
ok(v({ kind: "water" }) !== null && v({ kind: "water", ph: 15 }) !== null && v({ kind: "water", oxygenMgL: -1 }) !== null && v({ kind: "water", ph: 7.8, tempC: 9.5 }) === null, "water: at least one sensible reading");
ok(v({ kind: "feed", kg: 5, date: "2026-11-03" }) !== null && v({ kind: "feed", kg: 5, date: "2026-05-31" }) !== null && v({ kind: "feed", kg: 5, date: "bad" }) !== null, "no future dates, none before stocking");
ok(v({ kind: "nonsense" }) !== null, "unknown kinds are refused");
const c = cleanEntry({ date: "2026-10-30", kind: "feed", kg: 25.456, count: 99, ph: 7, note: " n " }, "id1");
ok(c.kg === 25.46 && c.count === undefined && c.ph === undefined && c.note === "n", "cleaning keeps only the fields that belong to the kind");

// ---- water flags and mortality alert ----
const wb = { tempMaxC: 14, tempMinC: 4, oxygenMinMgL: 7, phMin: 6.5, phMax: 8.5, ammoniaMaxMgL: 0.05 };
ok(waterFlags(wb, en({ kind: "water", date: today, tempC: 16, oxygenMgL: 5, ph: 9, ammoniaMgL: 0.2 })).length === 4, "four readings outside range are four flags");
ok(waterFlags(wb, en({ kind: "water", date: today, tempC: 10, oxygenMgL: 9, ph: 7.5 })).length === 0 && waterFlags({}, en({ kind: "water", date: today, tempC: 99 })).length === 0 && waterFlags(wb, null).length === 0, "in range, no ranges set, or no reading: no flags");
const sick = batch([en({ kind: "mortality", date: "2026-10-31", count: 40 })]);
ok(mortalityAlert(sick, today) !== null && /40 lost/.test(mortalityAlert(sick, today)!), "4% lost in a week raises an alert");
ok(mortalityAlert(batch([en({ kind: "mortality", date: "2026-10-31", count: 5 })]), today) === null, "half a percent does not");
ok(mortalityAlert(batch([en({ kind: "mortality", date: "2026-09-01", count: 400 })]), today) === null && mortalityAlert({ ...sick, status: "closed" }, today) === null, "old losses and closed batches do not alert");

// ---- wiring ----
const ctx = read("contexts/DataContext.tsx");
ok(/addFarmEntry: async[\s\S]*runTransaction\(db, async \(tx\)[\s\S]*validateEntryInput\(e, b, todayIso\(\)\)/.test(ctx), "entries are validated against the batch as it is, inside one transaction");
ok(!/collection\(db, "users", bizId, "(expenses|purchases|sales)"/.test(ctx.slice(ctx.indexOf("addFarmBatch: async"), ctx.indexOf("deleteFarmEntry: async") + 900)), "nothing on a batch posts to expenses, purchases or sales");
ok((ctx.match(/"memberships", "farmBatches"/g) ?? []).length === 2 && /"workOrders", "events", "farmBatches"/.test(ctx), "all three roles load farm batches");
ok(/match \/farmBatches\/\{docId\}[\s\S]{0,400}isOwnerOrActiveMember/.test(read("firestore.rules")) && /isOwnerOrOperatingMember/.test(read("firestore.rules").slice(read("firestore.rules").indexOf("match /farmBatches"), read("firestore.rules").indexOf("match /farmBatches") + 300)), "rules: members read, operating team writes");
ok(/"farmBatches"/.test(read("scripts/restore-from-backup.mjs")) && /farmBatches: data\.farmBatches/.test(read("lib/backupPayload.ts")), "backup and restore");
ok(/href: "\/farm"/.test(read("components/AppShell.tsx")) && /href: "\/farm"/.test(read("lib/navPrefs.ts")), "menu entries");
console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
