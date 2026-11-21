// Mileage log (lib/mileage.ts): distance from odometer readings, validation, monthly totals, odometer checks, and the wiring.
// Run: npx tsx scripts/verify-mileage.ts
import fs from "node:fs";
import { cleanTrip, odometerNotes, summarizeMonth, tripCost, tripKm, validateTripInput, type TripInput } from "../lib/mileage";
import type { Trip } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const base: TripInput = { date: "2026-11-02", vehicle: "Van WP-1234", purpose: "Deliver stock to Kandy", km: 120 };
ok(validateTripInput(base) === null, "a typed distance is enough");
ok(validateTripInput({ ...base, km: undefined, startOdometer: 45000, endOdometer: 45120 }) === null, "or both odometer readings");
ok(tripKm({ startOdometer: 45000, endOdometer: 45120.4 }) === 120.4 && tripKm({ km: 12.345 }) === 12.35 && tripKm({}) === null, "distance from readings, or typed, rounded to 0.01");
ok(validateTripInput({ ...base, km: undefined }) !== null, "no distance and no readings is refused");
ok(validateTripInput({ ...base, km: undefined, startOdometer: 100 }) !== null, "one reading alone is refused");
ok(validateTripInput({ ...base, km: undefined, startOdometer: 200, endOdometer: 100 }) !== null && validateTripInput({ ...base, km: undefined, startOdometer: 100, endOdometer: 100 }) !== null, "end must be above start");
ok(validateTripInput({ ...base, startOdometer: 100, endOdometer: 220, km: 120 }) === null && validateTripInput({ ...base, startOdometer: 100, endOdometer: 220, km: 150 }) !== null, "a typed distance must agree with the readings");
ok(validateTripInput({ ...base, km: 0 }) !== null && validateTripInput({ ...base, km: -4 }) !== null && validateTripInput({ ...base, km: 200000 }) !== null && validateTripInput({ ...base, km: NaN }) !== null, "zero, negative, absurd and missing distances are refused");
ok(validateTripInput({ ...base, purpose: "ab" }) !== null && validateTripInput({ ...base, vehicle: " " }) !== null && validateTripInput({ ...base, date: "2026-02-31" }) !== null, "purpose, vehicle and a real date are required");
ok(validateTripInput({ ...base, ratePerKm: -1 }) !== null && validateTripInput({ ...base, ratePerKm: 45 }) === null, "the rate cannot be negative");

const c = cleanTrip({ ...base, km: undefined, startOdometer: 100, endOdometer: 220, from: " Colombo ", to: "", notes: " n ", ratePerKm: 45.456 });
ok(c.km === 120 && c.from === "Colombo" && c.to === undefined && c.notes === "n" && c.ratePerKm === 45.46 && c.startOdometer === 100, "cleaning derives km, trims and drops blanks");
ok(cleanTrip({ ...base, ratePerKm: 0 }).ratePerKm === undefined, "a zero rate is not stored");

const t = (o: Partial<Trip>): Trip => ({ id: Math.random().toString(36).slice(2, 6), date: "2026-11-02", vehicle: "Van", purpose: "x", km: 100, createdAt: 1, updatedAt: 1, ...o });
const trips = [
  t({ km: 100, ratePerKm: 40 }), t({ km: 50.5, ratePerKm: 40, vehicle: " van " }), t({ km: 30, vehicle: "Bike", ratePerKm: 10 }),
  t({ km: 999, date: "2026-10-30" }), t({ km: 5, date: "2026-12-01" }),
];
const s = summarizeMonth(trips, "2026-11");
ok(s.trips === 3 && s.km === 180.5 && s.cost === 6320, "month totals (cost 4000 + 2020 + 300)");
ok(s.byVehicle.length === 2 && s.byVehicle[0].vehicle === "Van" && s.byVehicle[0].km === 150.5 && s.byVehicle[0].trips === 2, "vehicles are grouped regardless of case and spacing, biggest first");
ok(tripCost({ km: 10, ratePerKm: undefined }) === 0 && tripCost({ km: 33.33, ratePerKm: 3 }) === 99.99, "no rate means no cost; money rounds to cents");
ok(summarizeMonth(trips, "2027-01").trips === 0, "an empty month is zero");

const notes = odometerNotes([
  t({ id: "a", date: "2026-11-01", startOdometer: 1000, endOdometer: 1100 }),
  t({ id: "b", date: "2026-11-03", startOdometer: 1100, endOdometer: 1150 }),
  t({ id: "c", date: "2026-11-05", startOdometer: 1120, endOdometer: 1160 }),
  t({ id: "d", date: "2026-11-05", vehicle: "Bike", startOdometer: 50, endOdometer: 60 }),
  t({ id: "e", date: "2026-11-06" }),
]);
ok(notes.length === 1 && notes[0].tripId === "c", "a trip starting below the previous reading is flagged, others are not");
ok(odometerNotes([t({ id: "x", startOdometer: 10, endOdometer: 20 }), t({ id: "y", vehicle: "Bike", startOdometer: 5, endOdometer: 9 })]).length === 0, "different vehicles are checked separately");

const rules = read("firestore.rules");
const block = rules.slice(rules.indexOf("match /mileage/{docId}"), rules.indexOf("match /mileage/{docId}") + 330);
ok(/allow read: if canReadBooks/.test(block) && /allow create, update: if isOwnerOrManager/.test(block), "rules: accountant reads, owner and manager write, staff see nothing");
ok(/"mileage"/.test(read("scripts/restore-from-backup.mjs")) && /mileage: data\.trips/.test(read("lib/backupPayload.ts")), "backup and restore carry mileage");
ok(/href: "\/mileage"/.test(read("components/AppShell.tsx")) && /href: "\/mileage"/.test(read("lib/navPrefs.ts")), "menu entries");
const ctx = read("contexts/DataContext.tsx");
ok((ctx.match(/"cheques", "mileage"/g) ?? []).length === 2, "owner and manager/accountant subscribe, staff do not");
ok(!/addDoc\(collection\(db, "users", bizId, "expenses"/.test(ctx.slice(ctx.indexOf("addTrip: async"), ctx.indexOf("deleteTrip: async"))), "logging a trip posts no expense");
console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
