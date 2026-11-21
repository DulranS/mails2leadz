// Shipments: goods on their way to you (imports, supplier deliveries) or to a customer. Each one has a reference (waybill, airway
// bill, bill of lading or tracking number), a stage, the day each stage happened, and proof of delivery (who received it and the
// delivery reference). It is a manual record: nothing is fetched from a carrier or a customs system. Freight and customs costs
// belong on the purchase or expense, not here, so this changes no money figure.
import { addDays, isIsoDate } from "./playbook";
import type { Shipment, ShipmentStage } from "./types";

export const MAX_SHIP_REF = 60;
export const MAX_SHIP_CARRIER = 80;
export const MAX_SHIP_PLACE = 80;
export const MAX_SHIP_PERSON = 100;
export const MAX_SHIP_NOTES = 500;

export const SHIPMENT_STAGES: { value: ShipmentStage; label: string }[] = [
  { value: "booked", label: "Booked with carrier" },
  { value: "shipped", label: "On its way" },
  { value: "arrived", label: "Arrived at port or hub" },
  { value: "cleared", label: "Cleared customs" },
  { value: "delivered", label: "Delivered" },
];

const ORDER: ShipmentStage[] = ["booked", "shipped", "arrived", "cleared", "delivered"];
type StageDate = "shippedOn" | "arrivedOn" | "clearedOn" | "deliveredOn";
const DATE_FOR: Partial<Record<ShipmentStage, StageDate>> = {
  shipped: "shippedOn",
  arrived: "arrivedOn",
  cleared: "clearedOn",
  delivered: "deliveredOn",
};
const DATE_LABEL: Record<StageDate, string> = {
  shippedOn: "the day it left",
  arrivedOn: "the day it arrived",
  clearedOn: "the day it cleared customs",
  deliveredOn: "the day it was delivered",
};

export interface ShipmentInput {
  reference: string;
  carrier?: string;
  origin?: string;
  destination?: string;
  stage: ShipmentStage;
  supplierName?: string;
  etaDate?: string;
  shippedOn?: string;
  arrivedOn?: string;
  clearedOn?: string;
  deliveredOn?: string;
  receivedBy?: string;
  proofRef?: string;
  notes?: string;
}

const text = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

// Null when the input is fine, otherwise the sentence to show the person.
export function validateShipmentInput(i: ShipmentInput): string | null {
  if (!text(i.reference, MAX_SHIP_REF)) return "Enter the reference (waybill, airway bill, bill of lading or tracking number).";
  if (!ORDER.includes(i.stage)) return "Choose the stage.";
  for (const k of ["etaDate", "shippedOn", "arrivedOn", "clearedOn", "deliveredOn"] as const) {
    const v = i[k];
    if (v !== undefined && v !== "" && !isIsoDate(v)) return "Dates must be a real day.";
  }
  const reached = ORDER.indexOf(i.stage);
  for (let s = 1; s <= reached; s++) {
    const field = DATE_FOR[ORDER[s]]!;
    if (!i[field]) return `Enter ${DATE_LABEL[field]}.`;
  }
  if (i.stage === "delivered" && !text(i.receivedBy, MAX_SHIP_PERSON)) {
    return "Enter who received it. That is the proof of delivery.";
  }
  // Dates that are filled in must not run backwards.
  const filled = (["shippedOn", "arrivedOn", "clearedOn", "deliveredOn"] as const).filter((f) => i[f]);
  for (let n = 1; n < filled.length; n++) {
    if ((i[filled[n]] as string) < (i[filled[n - 1]] as string)) {
      return "The dates are out of order: each stage has to happen on or after the one before it.";
    }
  }
  if (typeof i.notes === "string" && i.notes.length > MAX_SHIP_NOTES) return `Keep the notes to ${MAX_SHIP_NOTES} characters.`;
  return null;
}

// Keeps only what the stage reached needs. Dates and proof beyond the current stage are dropped, so moving a shipment back a
// stage does not leave a stale delivery date or receiver behind.
export function cleanShipmentInput(i: ShipmentInput): ShipmentInput {
  const reached = ORDER.indexOf(i.stage);
  const out: ShipmentInput = { reference: text(i.reference, MAX_SHIP_REF), stage: i.stage };
  const put = (key: "carrier" | "origin" | "destination" | "supplierName", max: number) => {
    const v = text(i[key], max);
    if (v) out[key] = v;
  };
  put("carrier", MAX_SHIP_CARRIER);
  put("origin", MAX_SHIP_PLACE);
  put("destination", MAX_SHIP_PLACE);
  put("supplierName", MAX_SHIP_PLACE);
  if (i.etaDate && isIsoDate(i.etaDate) && reached < ORDER.length - 1) out.etaDate = i.etaDate;
  for (const [stage, field] of Object.entries(DATE_FOR) as [ShipmentStage, StageDate][]) {
    if (ORDER.indexOf(stage) <= reached && i[field]) out[field] = i[field];
  }
  if (reached === ORDER.length - 1) {
    const received = text(i.receivedBy, MAX_SHIP_PERSON);
    if (received) out.receivedBy = received;
    const proof = text(i.proofRef, MAX_SHIP_REF);
    if (proof) out.proofRef = proof;
  }
  const notes = text(i.notes, MAX_SHIP_NOTES);
  if (notes) out.notes = notes;
  return out;
}

// Whole days from one ISO date to another (to minus from).
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
}

export function nextStage(stage: ShipmentStage): ShipmentStage | null {
  const idx = ORDER.indexOf(stage);
  return idx >= 0 && idx < ORDER.length - 1 ? ORDER[idx + 1] : null;
}

export const isOpen = (s: Shipment) => s.stage !== "delivered";

// Still on the way and the expected day has passed.
export function isOverdue(s: Shipment, today: string): boolean {
  return isOpen(s) && !!s.etaDate && s.etaDate < today;
}

export interface ShipmentsSummary {
  open: number;
  overdue: number;
  deliveredLast30: number;
  avgDaysToDeliver: number | null; // origin departure to delivery, delivered shipments with both dates
}

export function summarizeShipments(list: Shipment[], today: string): ShipmentsSummary {
  const from = addDays(today, -29);
  const delivered = list.filter((s) => s.stage === "delivered");
  const timed = delivered.filter((s) => s.shippedOn && s.deliveredOn);
  const totalDays = timed.reduce((a, s) => a + daysBetween(s.shippedOn!, s.deliveredOn!), 0);
  return {
    open: list.filter(isOpen).length,
    overdue: list.filter((s) => isOverdue(s, today)).length,
    deliveredLast30: delivered.filter((s) => s.deliveredOn && s.deliveredOn >= from && s.deliveredOn <= today).length,
    avgDaysToDeliver: timed.length > 0 ? Math.round((totalDays / timed.length) * 10) / 10 : null,
  };
}

// Open shipments first: overdue ones on top, then by expected day (none last), then by reference.
export function sortOpenShipments(list: Shipment[], today: string): Shipment[] {
  return list
    .filter(isOpen)
    .sort((a, b) => {
      const ao = isOverdue(a, today) ? 0 : 1;
      const bo = isOverdue(b, today) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      const ae = a.etaDate ?? "9999-12-31";
      const be = b.etaDate ?? "9999-12-31";
      if (ae !== be) return ae < be ? -1 : 1;
      return a.reference.localeCompare(b.reference);
    });
}
