// Sustainability and community log (v255). What the business uses, sends to waste, recycles, emits, spends locally and gives back, recorded as you
// measure it, month by month. The app does not guess emission factors: enter the CO2e you have from your supplier or meter. Targets are yours to set.
// Pure.

export const SUSTAINABILITY_CATEGORIES = [
  { key: "energy_kwh", label: "Electricity used", unit: "kWh", group: "environment", lowerIsBetter: true },
  { key: "water_m3", label: "Water used", unit: "m³", group: "environment", lowerIsBetter: true },
  { key: "fuel_litres", label: "Fuel used (vehicles, generators)", unit: "litres", group: "environment", lowerIsBetter: true },
  { key: "waste_kg", label: "Waste sent to landfill", unit: "kg", group: "environment", lowerIsBetter: true },
  { key: "recycled_kg", label: "Waste recycled", unit: "kg", group: "environment", lowerIsBetter: false },
  { key: "co2e_kg", label: "Emissions (CO₂e, from your supplier or meter)", unit: "kg", group: "environment", lowerIsBetter: true },
  { key: "local_spend", label: "Spent with local suppliers", unit: "currency", group: "community", lowerIsBetter: false },
  { key: "donation", label: "Donations and sponsorship", unit: "currency", group: "community", lowerIsBetter: false },
  { key: "volunteer_hours", label: "Staff volunteer hours", unit: "hours", group: "community", lowerIsBetter: false },
] as const;

export type SustainabilityKey = (typeof SUSTAINABILITY_CATEGORIES)[number]["key"];
export interface SustainabilityEntry { id: string; date: string; category: SustainabilityKey; amount: number; notes?: string }

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(Date.parse(`${s}T00:00:00Z`)).toISOString().slice(0, 10) === s;

export function validateEntry(i: { date: string; category: string; amount: number }): string | null {
  if (!isDay(i.date)) return "Enter the day it was measured.";
  if (!SUSTAINABILITY_CATEGORIES.some((c) => c.key === i.category)) return "Choose what you measured.";
  if (!Number.isFinite(i.amount) || i.amount < 0) return "The amount must be zero or more.";
  return null;
}

// Totals per category for one month ("YYYY-MM").
export function monthTotals(entries: SustainabilityEntry[], month: string): Record<SustainabilityKey, number> {
  const out = Object.fromEntries(SUSTAINABILITY_CATEGORIES.map((c) => [c.key, 0])) as Record<SustainabilityKey, number>;
  for (const e of entries) if (e.date.slice(0, 7) === month) out[e.category] = Math.round((out[e.category] + e.amount) * 100) / 100;
  return out;
}

// Recycling rate for a month: recycled ÷ (landfill + recycled). Null when nothing was sent to waste or recycling.
export function recyclingRatePct(t: Record<SustainabilityKey, number>): number | null {
  const total = t.waste_kg + t.recycled_kg;
  return total > 0 ? Math.round((t.recycled_kg / total) * 1000) / 10 : null;
}

// Against a target you set: lower-is-better categories must stay at or under it; the others must reach it.
export function targetStatus(key: SustainabilityKey, total: number, target: number | undefined): "no_target" | "on_track" | "off_track" {
  if (target === undefined) return "no_target";
  const cat = SUSTAINABILITY_CATEGORIES.find((c) => c.key === key)!;
  return (cat.lowerIsBetter ? total <= target : total >= target) ? "on_track" : "off_track";
}
