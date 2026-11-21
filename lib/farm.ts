// Farm batches: a group of animals (or a crop) followed from stocking to harvest. Pure: no I/O.
// Counts what is alive, survival, biomass, feed conversion, harvest, cost per kg and water readings. A record beside the books:
// feed and fingerlings are bought through Purchases and the harvest is sold through Sales as usual. The costs typed here are an
// estimate for working out cost per kg; they are never posted, so nothing is counted twice.
import { isIsoDate } from "./playbook";
import type { FarmBatch, FarmEntry, FarmEntryKind } from "./types";

export const FARM_KINDS: FarmEntryKind[] = ["mortality", "cull", "transfer_in", "feed", "sample", "water", "cost", "harvest"];
export const MAX_COUNT = 100_000_000;
export const MAX_ENTRIES = 3000; // a batch document holds its log, so the log is bounded

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const whole = (n: unknown): n is number => isNum(n) && Number.isInteger(n) && n > 0 && n <= MAX_COUNT;

export interface BatchInput {
  name: string; species: string; unitLabel?: string; location?: string; startDate: string; startCount: number; startAvgWeightG: number;
  status: "active" | "closed";
  tempMinC?: number; tempMaxC?: number; oxygenMinMgL?: number; phMin?: number; phMax?: number; ammoniaMaxMgL?: number; notes?: string;
}

export function validateBatchInput(b: BatchInput): string | null {
  if ((b.name ?? "").trim().length < 2 || b.name.trim().length > 80) return "Give the batch a name (2 to 80 characters).";
  if ((b.species ?? "").trim().length < 2 || b.species.trim().length > 60) return "Enter the species or crop (2 to 60 characters).";
  if (!isIsoDate(b.startDate)) return "Enter the date it was stocked or planted.";
  if (!whole(b.startCount)) return "Enter how many were stocked, a whole number above zero.";
  if (!isNum(b.startAvgWeightG) || b.startAvgWeightG <= 0 || b.startAvgWeightG > 5_000_000) return "Enter the average weight of one at stocking, in grams, above zero.";
  if (b.status !== "active" && b.status !== "closed") return "Choose a status.";
  for (const [label, v] of [["minimum temperature", b.tempMinC], ["maximum temperature", b.tempMaxC], ["minimum oxygen", b.oxygenMinMgL], ["minimum pH", b.phMin], ["maximum pH", b.phMax], ["maximum ammonia", b.ammoniaMaxMgL]] as const) {
    if (v !== undefined && !isNum(v)) return `Check the ${label}.`;
  }
  if (b.tempMinC !== undefined && b.tempMaxC !== undefined && b.tempMinC > b.tempMaxC) return "The minimum temperature cannot be above the maximum.";
  if (b.phMin !== undefined && b.phMax !== undefined && b.phMin > b.phMax) return "The minimum pH cannot be above the maximum.";
  return null;
}

export interface EntryInput extends Partial<Omit<FarmEntry, "id">> { date: string; kind: FarmEntryKind }

export function validateEntryInput(e: EntryInput, batch: Pick<FarmBatch, "startDate" | "entries" | "startCount">, today: string): string | null {
  if (!FARM_KINDS.includes(e.kind)) return "Choose what you are recording.";
  if (!isIsoDate(e.date)) return "Enter the date.";
  if (e.date > today) return "The date cannot be in the future.";
  if (e.date < batch.startDate) return `The batch was stocked on ${batch.startDate}. An entry cannot be earlier.`;
  if ((e.note ?? "").length > 200) return "Keep the note under 200 characters.";
  if (batch.entries.length >= MAX_ENTRIES) return "This batch has reached its limit of entries. Close it and start a new batch.";
  switch (e.kind) {
    case "mortality": case "cull":
      if (!whole(e.count)) return "Enter how many, a whole number above zero.";
      if (e.count > livePopulation(batch as FarmBatch)) return `Only ${livePopulation(batch as FarmBatch)} are alive in this batch.`;
      return null;
    case "transfer_in":
      if (!whole(e.count)) return "Enter how many were added, a whole number above zero.";
      if (!isNum(e.avgWeightG) || e.avgWeightG <= 0) return "Enter their average weight in grams.";
      return null;
    case "feed":
      return isNum(e.kg) && e.kg > 0 && e.kg <= 10_000_000 ? null : "Enter the feed given in kg, above zero.";
    case "sample":
      return isNum(e.avgWeightG) && e.avgWeightG > 0 && e.avgWeightG <= 5_000_000 ? null : "Enter the average weight from the sample, in grams.";
    case "water": {
      const any = [e.tempC, e.oxygenMgL, e.ph, e.salinityPpt, e.ammoniaMgL].some((v) => v !== undefined);
      if (!any) return "Enter at least one reading.";
      if ([e.tempC, e.oxygenMgL, e.ph, e.salinityPpt, e.ammoniaMgL].some((v) => v !== undefined && !isNum(v))) return "Check the readings.";
      if (e.ph !== undefined && (e.ph < 0 || e.ph > 14)) return "pH is between 0 and 14.";
      if ((e.oxygenMgL !== undefined && e.oxygenMgL < 0) || (e.ammoniaMgL !== undefined && e.ammoniaMgL < 0) || (e.salinityPpt !== undefined && e.salinityPpt < 0)) return "A reading cannot be negative.";
      return null;
    }
    case "cost":
      if (!isNum(e.amount) || e.amount <= 0 || e.amount > 1_000_000_000) return "Enter the cost, above zero.";
      return (e.label ?? "").trim().length >= 2 ? null : "Say what the cost was for.";
    case "harvest":
      if (!whole(e.count)) return "Enter how many were harvested, a whole number above zero.";
      if (e.count > livePopulation(batch as FarmBatch)) return `Only ${livePopulation(batch as FarmBatch)} are alive in this batch.`;
      return isNum(e.kg) && e.kg > 0 ? null : "Enter the weight harvested in kg.";
  }
}

export function cleanEntry(e: EntryInput, id: string): FarmEntry {
  const out: FarmEntry = { id, date: e.date, kind: e.kind };
  const num = (k: keyof FarmEntry, v: unknown) => { if (isNum(v)) (out as unknown as Record<string, unknown>)[k] = r2(v); };
  if (e.kind === "mortality" || e.kind === "cull" || e.kind === "transfer_in" || e.kind === "harvest") out.count = e.count;
  if (e.kind === "feed" || e.kind === "harvest") num("kg", e.kg);
  if (e.kind === "sample" || e.kind === "transfer_in") num("avgWeightG", e.avgWeightG);
  if (e.kind === "cost") { num("amount", e.amount); out.label = (e.label ?? "").trim().slice(0, 80); }
  if (e.kind === "water") { num("tempC", e.tempC); num("oxygenMgL", e.oxygenMgL); num("ph", e.ph); num("salinityPpt", e.salinityPpt); num("ammoniaMgL", e.ammoniaMgL); }
  if (e.note?.trim()) out.note = e.note.trim().slice(0, 200);
  return out;
}

const sum = (b: Pick<FarmBatch, "entries">, kind: FarmEntryKind, f: (e: FarmEntry) => number | undefined) => b.entries.filter((e) => e.kind === kind).reduce((n, e) => n + (f(e) ?? 0), 0);

export function livePopulation(b: Pick<FarmBatch, "startCount" | "entries">): number {
  return Math.max(0, b.startCount + sum(b, "transfer_in", (e) => e.count) - sum(b, "mortality", (e) => e.count) - sum(b, "cull", (e) => e.count) - sum(b, "harvest", (e) => e.count));
}

const byDate = (a: FarmEntry, b: FarmEntry) => a.date.localeCompare(b.date);

export interface BatchStats {
  alive: number; stocked: number; mortality: number; culled: number; harvestedCount: number;
  survivalPct: number; // of everything stocked, how many were not lost to mortality or culling
  avgWeightG: number; // latest sample, else the stocking weight
  weightDate: string;
  biomassKg: number; // alive times the latest average weight
  feedKg: number; harvestKg: number; totalCost: number;
  gainKg: number; // what the batch grew: biomass now plus harvested, less what went in
  fcr: number | null; // feed given per kg grown; null until there is growth to measure against
  costPerKgHarvested: number | null;
  daysIn: number;
  mortalityLast7: number;
  latestWater: FarmEntry | null;
}

export function batchStats(b: FarmBatch, today: string): BatchStats {
  const alive = livePopulation(b);
  const transfers = b.entries.filter((e) => e.kind === "transfer_in");
  const stocked = b.startCount + transfers.reduce((n, e) => n + (e.count ?? 0), 0);
  const mortality = sum(b, "mortality", (e) => e.count);
  const culled = sum(b, "cull", (e) => e.count);
  const harvestedCount = sum(b, "harvest", (e) => e.count);
  const samples = b.entries.filter((e) => e.kind === "sample" && isNum(e.avgWeightG)).sort(byDate);
  const last = samples[samples.length - 1];
  const avgWeightG = last?.avgWeightG ?? b.startAvgWeightG;
  const biomassKg = r2((alive * avgWeightG) / 1000);
  const feedKg = r2(sum(b, "feed", (e) => e.kg));
  const harvestKg = r2(sum(b, "harvest", (e) => e.kg));
  const totalCost = r2(sum(b, "cost", (e) => e.amount));
  const startBiomass = (b.startCount * b.startAvgWeightG) / 1000;
  const addedBiomass = transfers.reduce((n, e) => n + ((e.count ?? 0) * (e.avgWeightG ?? b.startAvgWeightG)) / 1000, 0);
  const gainKg = r2(biomassKg + harvestKg - startBiomass - addedBiomass);
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${b.startDate}T00:00:00Z`)) / 86_400_000);
  const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
  const water = b.entries.filter((e) => e.kind === "water").sort(byDate);
  return {
    alive, stocked, mortality, culled, harvestedCount,
    survivalPct: stocked > 0 ? r1(((stocked - mortality - culled) / stocked) * 100) : 0,
    avgWeightG, weightDate: last?.date ?? b.startDate, biomassKg, feedKg, harvestKg, totalCost, gainKg,
    fcr: gainKg > 0 && feedKg > 0 ? r2(feedKg / gainKg) : null,
    costPerKgHarvested: harvestKg > 0 && totalCost > 0 ? r2(totalCost / harvestKg) : null,
    daysIn: Math.max(0, days),
    mortalityLast7: b.entries.filter((e) => e.kind === "mortality" && e.date >= weekAgo).reduce((n, e) => n + (e.count ?? 0), 0),
    latestWater: water[water.length - 1] ?? null,
  };
}

export interface WaterFlag { field: string; message: string }

// Readings outside the ranges the owner set for this batch. Only a flag: nothing is blocked and nothing changes.
export function waterFlags(b: Pick<FarmBatch, "tempMinC" | "tempMaxC" | "oxygenMinMgL" | "phMin" | "phMax" | "ammoniaMaxMgL">, w: FarmEntry | null): WaterFlag[] {
  if (!w) return [];
  const f: WaterFlag[] = [];
  if (w.tempC !== undefined && b.tempMaxC !== undefined && w.tempC > b.tempMaxC) f.push({ field: "temperature", message: `Temperature ${w.tempC} C is above ${b.tempMaxC} C.` });
  if (w.tempC !== undefined && b.tempMinC !== undefined && w.tempC < b.tempMinC) f.push({ field: "temperature", message: `Temperature ${w.tempC} C is below ${b.tempMinC} C.` });
  if (w.oxygenMgL !== undefined && b.oxygenMinMgL !== undefined && w.oxygenMgL < b.oxygenMinMgL) f.push({ field: "oxygen", message: `Oxygen ${w.oxygenMgL} mg/L is below ${b.oxygenMinMgL}.` });
  if (w.ph !== undefined && b.phMin !== undefined && w.ph < b.phMin) f.push({ field: "ph", message: `pH ${w.ph} is below ${b.phMin}.` });
  if (w.ph !== undefined && b.phMax !== undefined && w.ph > b.phMax) f.push({ field: "ph", message: `pH ${w.ph} is above ${b.phMax}.` });
  if (w.ammoniaMgL !== undefined && b.ammoniaMaxMgL !== undefined && w.ammoniaMgL > b.ammoniaMaxMgL) f.push({ field: "ammonia", message: `Ammonia ${w.ammoniaMgL} mg/L is above ${b.ammoniaMaxMgL}.` });
  return f;
}

// A day with unusually many deaths is the first sign of trouble: more than 1% of what is alive in one entry, or more than 2% across the last seven days.
export function mortalityAlert(b: FarmBatch, today: string): string | null {
  if (b.status !== "active") return null;
  const s = batchStats(b, today);
  const base = s.alive + s.mortalityLast7;
  if (base <= 0) return null;
  const pct = (s.mortalityLast7 / base) * 100;
  return pct > 2 ? `${s.mortalityLast7} lost in the last 7 days (${r1(pct)}% of the batch). Check the water and the stock.` : null;
}
