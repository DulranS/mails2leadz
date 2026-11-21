// Sustainability and community log (lib/sustainability.ts, the screen, the data layer): the entries and their checks, monthly totals, the recycling rate
// (including the case with no waste), target direction for lower-is-better and higher-is-better measures, and the wiring. Worked numbers. Run:
// npx tsx scripts/verify-sustainability.ts
import fs from "node:fs";
import { validateEntry, monthTotals, recyclingRatePct, targetStatus, SUSTAINABILITY_CATEGORIES, type SustainabilityEntry } from "../lib/sustainability";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(validateEntry({ date: "2026-11-03", category: "energy_kwh", amount: 1200 }) === null, "a measured amount on a real day is accepted");
ok(validateEntry({ date: "2026-11-31", category: "energy_kwh", amount: 1 }) !== null, "a day that does not exist is refused");
ok(validateEntry({ date: "2026-11-03", category: "carbon", amount: 1 }) !== null, "a category the log does not know is refused");
ok(validateEntry({ date: "2026-11-03", category: "waste_kg", amount: -5 }) !== null, "a negative amount is refused");
ok(SUSTAINABILITY_CATEGORIES.length === 9, "nine things are measured: five environment, four community, plus the emissions figure");

const entries: SustainabilityEntry[] = [
  { id: "1", date: "2026-10-05", category: "energy_kwh", amount: 400 },
  { id: "2", date: "2026-10-20", category: "energy_kwh", amount: 350 },
  { id: "3", date: "2026-10-12", category: "waste_kg", amount: 60 },
  { id: "4", date: "2026-10-12", category: "recycled_kg", amount: 40 },
  { id: "5", date: "2026-09-30", category: "energy_kwh", amount: 999 },   // another month: not in October
];
const oct = monthTotals(entries, "2026-10");
ok(oct.energy_kwh === 750 && oct.waste_kg === 60 && oct.water_m3 === 0, "October's energy is 750 kWh (400 + 350), the September entry is left out, and an unmeasured category is zero");
ok(recyclingRatePct(oct) === 40, "recycled 40 kg of 100 kg handled (40 + 60) is a 40% recycling rate");
ok(recyclingRatePct(monthTotals([], "2026-10")) === null, "with no waste or recycling recorded, no rate is shown rather than a division by zero");

ok(targetStatus("energy_kwh", 750, 800) === "on_track", "energy at or under a 800 kWh target is on track (lower is better)");
ok(targetStatus("energy_kwh", 900, 800) === "off_track", "energy over the target is off track");
ok(targetStatus("recycled_kg", 40, 50) === "off_track" && targetStatus("local_spend", 500, 400) === "on_track", "a higher-is-better measure must reach its target: recycling 40 against 50 is off track; local spend 500 against 400 is on track");
ok(targetStatus("waste_kg", 60, undefined) === "no_target", "with no target set, nothing is judged");

const screen = read("components/ops/SustainabilityPanel.tsx");
ok(screen.includes("monthTotals(") && screen.includes("targetStatus("), "the screen shows the monthly totals and judges them against the targets");
ok(read("contexts/DataContext.tsx").includes("addSustainabilityEntry: async") && read("contexts/DataContext.tsx").includes("deleteSustainabilityEntry"), "the log is stored, with add and delete");
ok(read("lib/operations.ts").includes("\"sustainability\""), "the sustainability log is a screen for the owner and manager");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
