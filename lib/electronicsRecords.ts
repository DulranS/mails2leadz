// Electronics-trade records: licences and permits (with expiry dates to watch), trade-ins (a used device a customer hands in as
// part payment), and price-protection claims (credit owed by a supplier when they cut the price of stock you still hold).
// Pure: validation and totals. The app records and reminds; it does not file with any authority, pay a supplier, or post a ledger
// entry. Every record is saved by a button press.

export type ElectronicsKind = "licence" | "tradein" | "pricedrop";

export interface LicenceRecord {
  kind: "licence";
  name: string;
  authority?: string;
  number?: string;
  issuedDate?: string;
  expiryDate?: string;
  cost?: number;
  note?: string;
}

export type TradeInCondition = "excellent" | "good" | "fair" | "faulty";
export type TradeInStatus = "open" | "credited" | "paid_out" | "resold";

export interface TradeInRecord {
  kind: "tradein";
  customer?: string;
  device: string;
  serialNo?: string;
  condition: TradeInCondition;
  agreedCredit: number; // what the customer is credited toward a new purchase, or paid out
  date: string;
  status: TradeInStatus;
  note?: string;
}

export type PriceDropStatus = "open" | "claimed" | "credited";

export interface PriceDropRecord {
  kind: "pricedrop";
  supplier?: string;
  product: string;
  oldPrice: number;
  newPrice: number;
  unitsOnHand: number;
  date: string; // the day the supplier cut the price
  status: PriceDropStatus;
  note?: string;
}

// R&D and product development: one project per product idea, moved through its stages, with a budget and a target launch date.
// It is a planning record only; spending that budget is recorded as purchases and expenses in the usual way.
export type ProjectStatus = "idea" | "prototype" | "testing" | "certification" | "launched" | "dropped";

export interface ProjectRecord {
  kind: "project";
  name: string;
  status: ProjectStatus;
  budget?: number;
  targetDate?: string;
  note?: string;
}

export type ElectronicsRecord = LicenceRecord | TradeInRecord | PriceDropRecord | ProjectRecord;
export type ElectronicsInput = ElectronicsRecord;
export type StoredElectronicsRecord = ElectronicsRecord & { id: string; createdAt: number; createdByUid?: string; createdByName?: string };

export const TRADE_IN_CONDITIONS: TradeInCondition[] = ["excellent", "good", "fair", "faulty"];
export const TRADE_IN_STATUSES: TradeInStatus[] = ["open", "credited", "paid_out", "resold"];
export const PRICE_DROP_STATUSES: PriceDropStatus[] = ["open", "claimed", "credited"];
export const PROJECT_STATUSES: ProjectStatus[] = ["idea", "prototype", "testing", "certification", "launched", "dropped"];
export const MAX_NAME = 120;
export const MAX_NOTE = 400;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Price protection: the drop per unit times the units still held at the time of the cut. Zero when the price did not fall.
export function priceProtectionClaim(oldPrice: number, newPrice: number, unitsOnHand: number): number {
  if (!Number.isFinite(oldPrice) || !Number.isFinite(newPrice) || !Number.isFinite(unitsOnHand)) return 0;
  return round2(Math.max(0, oldPrice - newPrice) * Math.max(0, unitsOnHand));
}

export function validateElectronics(r: ElectronicsInput): string | null {
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  if (text((r as { note?: string }).note).length > MAX_NOTE) return `Keep the note under ${MAX_NOTE} characters.`;
  if (r.kind === "licence") {
    if (!r.name.trim()) return "Name the licence or permit.";
    if (r.name.trim().length > MAX_NAME) return `Keep the name under ${MAX_NAME} characters.`;
    if (r.issuedDate && !ISO_DAY.test(r.issuedDate)) return "The issue date should be a date.";
    if (r.expiryDate && !ISO_DAY.test(r.expiryDate)) return "The expiry date should be a date.";
    if (r.issuedDate && r.expiryDate && r.expiryDate < r.issuedDate) return "The expiry date can't be before the issue date.";
    if (r.cost !== undefined && (!Number.isFinite(r.cost) || r.cost < 0)) return "The cost can't be negative.";
    return null;
  }
  if (r.kind === "project") {
    if (!r.name.trim()) return "Name the product or project.";
    if (r.name.trim().length > MAX_NAME) return `Keep the name under ${MAX_NAME} characters.`;
    if (!PROJECT_STATUSES.includes(r.status)) return "Choose a stage.";
    if (r.budget !== undefined && (!Number.isFinite(r.budget) || r.budget < 0)) return "The budget can't be negative.";
    if (r.targetDate && !ISO_DAY.test(r.targetDate)) return "The target date should be a date.";
    return null;
  }
  if (!ISO_DAY.test(r.date)) return "Pick a date.";
  if (r.kind === "tradein") {
    if (!r.device.trim()) return "Name the device handed in.";
    if (!TRADE_IN_CONDITIONS.includes(r.condition)) return "Choose the condition.";
    if (!Number.isFinite(r.agreedCredit) || r.agreedCredit < 0) return "The agreed credit can't be negative.";
    if (!TRADE_IN_STATUSES.includes(r.status)) return "Choose a status.";
    return null;
  }
  if (!r.product.trim()) return "Name the product whose price fell.";
  if (!Number.isFinite(r.oldPrice) || r.oldPrice <= 0) return "Enter the old price per unit.";
  if (!Number.isFinite(r.newPrice) || r.newPrice < 0) return "Enter the new price per unit.";
  if (r.newPrice >= r.oldPrice) return "Price protection applies only when the price fell.";
  if (!Number.isInteger(r.unitsOnHand) || r.unitsOnHand < 0) return "Enter the units you still hold.";
  if (!PRICE_DROP_STATUSES.includes(r.status)) return "Choose a status.";
  return null;
}

export type LicenceStatus = "none" | "ok" | "expiring" | "expired";

export function licenceStatus(expiryDate: string | undefined, today: string, windowDays = 60): LicenceStatus {
  if (!expiryDate || !ISO_DAY.test(expiryDate)) return "none";
  if (expiryDate < today) return "expired";
  const diff = Math.round((Date.parse(expiryDate) - Date.parse(today)) / 86_400_000);
  return diff <= windowDays ? "expiring" : "ok";
}

// Licences that have expired or expire within the window, soonest first.
export function licencesToWatch(records: StoredElectronicsRecord[], today: string, windowDays = 60) {
  return records
    .filter((r): r is StoredElectronicsRecord & LicenceRecord => r.kind === "licence")
    .map((r) => ({ r, status: licenceStatus(r.expiryDate, today, windowDays) }))
    .filter((x) => x.status === "expired" || x.status === "expiring")
    .sort((a, b) => (a.r.expiryDate ?? "").localeCompare(b.r.expiryDate ?? ""));
}

export function tradeInOwed(records: StoredElectronicsRecord[]): number {
  return round2(
    records
      .filter((r): r is StoredElectronicsRecord & TradeInRecord => r.kind === "tradein" && r.status === "open")
      .reduce((s, r) => s + r.agreedCredit, 0)
  );
}

export function priceProtectionOpen(records: StoredElectronicsRecord[]): number {
  return round2(
    records
      .filter((r): r is StoredElectronicsRecord & PriceDropRecord => r.kind === "pricedrop" && r.status === "open")
      .reduce((s, r) => s + priceProtectionClaim(r.oldPrice, r.newPrice, r.unitsOnHand), 0)
  );
}

// Open R&D budgets: projects not yet launched or dropped.
export function projectBudgetOpen(records: StoredElectronicsRecord[]): number {
  return round2(
    records
      .filter((r): r is StoredElectronicsRecord & ProjectRecord => r.kind === "project" && r.status !== "launched" && r.status !== "dropped")
      .reduce((s, r) => s + (r.budget ?? 0), 0)
  );
}
