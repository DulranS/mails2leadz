// Mileage log: business trips by vehicle, with optional odometer readings. Pure: no I/O.
// A memo beside the books. The cost shown is km times a rate you type, an estimate of what running the vehicle cost for those trips;
// it is never posted as an expense, so it cannot double-count fuel or repairs you already recorded.
import { isIsoDate } from "./playbook";
import type { Trip } from "./types";

export const MAX_KM = 100_000;
export const MAX_RATE_PER_KM = 100_000;

export interface TripInput {
  date: string;
  vehicle: string;
  purpose: string;
  from?: string;
  to?: string;
  startOdometer?: number;
  endOdometer?: number;
  km?: number; // may be left out when both odometer readings are given
  ratePerKm?: number;
  notes?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

// The distance of a trip: from the odometer readings when both are given, otherwise the km typed.
export function tripKm(i: Pick<TripInput, "startOdometer" | "endOdometer" | "km">): number | null {
  if (isNum(i.startOdometer) && isNum(i.endOdometer)) return r2(i.endOdometer - i.startOdometer);
  return isNum(i.km) ? r2(i.km) : null;
}

export function validateTripInput(i: TripInput): string | null {
  if (!isIsoDate(i.date)) return "Enter the date of the trip.";
  const vehicle = (i.vehicle ?? "").trim();
  if (vehicle.length < 1 || vehicle.length > 60) return "Enter which vehicle (up to 60 characters).";
  const purpose = (i.purpose ?? "").trim();
  if (purpose.length < 3 || purpose.length > 200) return "Enter the business purpose of the trip (3 to 200 characters).";
  if ((i.from ?? "").length > 120 || (i.to ?? "").length > 120) return "Keep the places under 120 characters.";
  for (const [label, v] of [["start", i.startOdometer], ["end", i.endOdometer]] as const) {
    if (v !== undefined && (!isNum(v) || v < 0 || v > 10_000_000)) return `Check the ${label} odometer reading.`;
  }
  if ((i.startOdometer === undefined) !== (i.endOdometer === undefined)) return "Enter both odometer readings, or neither.";
  if (i.km !== undefined && !isNum(i.km)) return "Check the distance.";
  const km = tripKm(i);
  if (km === null) return "Enter the distance, or both odometer readings.";
  if (km <= 0) return i.startOdometer !== undefined ? "The end reading has to be higher than the start reading." : "Enter a distance above zero.";
  if (km > MAX_KM) return "That distance is too large to be one trip. Check it.";
  // A typed distance next to odometer readings must agree with them (within half a kilometre), so one cannot quietly contradict the other.
  if (i.startOdometer !== undefined && i.km !== undefined && Math.abs(i.km - km) > 0.5) return `The readings give ${km} km but you typed ${i.km} km. Fix one of them.`;
  if (i.ratePerKm !== undefined && (!isNum(i.ratePerKm) || i.ratePerKm < 0 || i.ratePerKm > MAX_RATE_PER_KM)) return "The cost per km cannot be negative.";
  return null;
}

export function cleanTrip(i: TripInput): Omit<Trip, "id" | "createdAt" | "updatedAt" | "createdByUid" | "createdByName"> {
  const km = tripKm(i) ?? 0;
  const out: Omit<Trip, "id" | "createdAt" | "updatedAt" | "createdByUid" | "createdByName"> = {
    date: i.date, vehicle: i.vehicle.trim(), purpose: i.purpose.trim(), km,
  };
  if (i.from?.trim()) out.from = i.from.trim();
  if (i.to?.trim()) out.to = i.to.trim();
  if (i.startOdometer !== undefined && i.endOdometer !== undefined) { out.startOdometer = i.startOdometer; out.endOdometer = i.endOdometer; }
  if (i.ratePerKm !== undefined && i.ratePerKm > 0) out.ratePerKm = r2(i.ratePerKm);
  if (i.notes?.trim()) out.notes = i.notes.trim().slice(0, 300);
  return out;
}

export interface MileageRow { vehicle: string; trips: number; km: number; cost: number }
export interface MileageSummary { month: string; trips: number; km: number; cost: number; byVehicle: MileageRow[] }

export function tripCost(t: Pick<Trip, "km" | "ratePerKm">): number {
  return r2(t.km * (t.ratePerKm ?? 0));
}

// One month (YYYY-MM): trips, kilometres and the estimated running cost, in total and by vehicle, biggest first.
export function summarizeMonth(trips: Trip[], month: string): MileageSummary {
  const by = new Map<string, MileageRow>();
  let total = { trips: 0, km: 0, cost: 0 };
  for (const t of trips) {
    if (!t.date.startsWith(month)) continue;
    const key = t.vehicle.trim().toLowerCase();
    const row = by.get(key) ?? { vehicle: t.vehicle.trim(), trips: 0, km: 0, cost: 0 };
    row.trips += 1; row.km = r2(row.km + t.km); row.cost = r2(row.cost + tripCost(t));
    by.set(key, row);
    total = { trips: total.trips + 1, km: r2(total.km + t.km), cost: r2(total.cost + tripCost(t)) };
  }
  return { month, ...total, byVehicle: [...by.values()].sort((a, b) => b.km - a.km || a.vehicle.localeCompare(b.vehicle)) };
}

export interface OdometerNote { tripId: string; vehicle: string; date: string; message: string }

// Where the odometer readings of one vehicle do not join up: a trip that starts below where the previous one ended (a reading
// mistyped, or a trip entered out of order), or readings that skip kilometres nobody logged (private use or a missing trip).
// Notes only. Nothing is blocked, because a vehicle also serves private trips that are not logged here.
export function odometerNotes(trips: Trip[]): OdometerNote[] {
  const notes: OdometerNote[] = [];
  const byVehicle = new Map<string, Trip[]>();
  for (const t of trips) {
    if (t.startOdometer === undefined || t.endOdometer === undefined) continue;
    const k = t.vehicle.trim().toLowerCase();
    byVehicle.set(k, [...(byVehicle.get(k) ?? []), t]);
  }
  for (const list of byVehicle.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date) || (a.startOdometer! - b.startOdometer!));
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], cur = list[i];
      if (cur.startOdometer! < prev.endOdometer!) {
        notes.push({ tripId: cur.id, vehicle: cur.vehicle, date: cur.date, message: `Starts at ${cur.startOdometer} but the earlier trip on ${prev.date} ended at ${prev.endOdometer}. Check the readings.` });
      }
    }
  }
  return notes.sort((a, b) => b.date.localeCompare(a.date));
}
