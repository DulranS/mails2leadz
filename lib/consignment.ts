// Consignment: goods you leave with a partner (a shop, a market stall, an agent) who sells them and pays you your share later.
// The goods stay yours until they sell, so this ledger tracks three things per partner: how many units are out with them, what
// their reported sales came to, and how much you still owe them or they owe you. Pure: validation and totals. Money here is a
// record of what is owed; paying a partner is recorded as a settlement here (it is not posted to expenses or sales).
// Note: sold units are recorded from the partner's report. Stock counts and profit for consigned goods are not changed here.

export type ConsignmentKind = "placed" | "sold" | "returned" | "settled";

export interface ConsignmentEntry {
  id: string;
  kind: ConsignmentKind;
  partner: string;
  date: string; // ISO day
  productName?: string; // placed, sold, returned
  qty?: number; // placed, sold, returned
  unitPrice?: number; // sold: the price per unit the partner sold at (shop currency)
  partnerSharePct?: number; // sold: the partner's agreed share of each sale, 0 to 100
  amount?: number; // settled: what you paid the partner
  note?: string;
  createdAt: number;
}

export type ConsignmentInput = Omit<ConsignmentEntry, "id" | "createdAt">;

export const MAX_PARTNER_NAME = 80;
export const MAX_CONSIGNMENT_NOTE = 300;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n: number) => Math.round(n * 100) / 100;
const keyOf = (s: string) => s.trim().toLowerCase();

// Units of one product out with one partner: placed, less what sold and what came back.
export function onConsignmentQty(entries: ConsignmentEntry[], partner: string, productName: string): number {
  const p = keyOf(partner);
  const prod = keyOf(productName);
  let n = 0;
  for (const e of entries) {
    if (keyOf(e.partner) !== p || keyOf(e.productName ?? "") !== prod) continue;
    if (e.kind === "placed") n += e.qty ?? 0;
    if (e.kind === "sold" || e.kind === "returned") n -= e.qty ?? 0;
  }
  return n;
}

// What you owe the partner on their reported sales, less what you have already paid them. Negative = they owe you.
export function balanceOwed(entries: ConsignmentEntry[], partner: string): number {
  const p = keyOf(partner);
  let owed = 0;
  let paid = 0;
  for (const e of entries) {
    if (keyOf(e.partner) !== p) continue;
    if (e.kind === "sold") owed += ((e.qty ?? 0) * (e.unitPrice ?? 0) * (e.partnerSharePct ?? 0)) / 100;
    if (e.kind === "settled") paid += e.amount ?? 0;
  }
  return round2(owed - paid);
}

// Checks a new entry against the entries already recorded. Null when it is fine, otherwise the reason.
export function validateConsignment(input: ConsignmentInput, existing: ConsignmentEntry[]): string | null {
  const partner = (input.partner ?? "").trim();
  if (!partner) return "Name the partner the goods are with.";
  if (partner.length > MAX_PARTNER_NAME) return `Keep the partner's name under ${MAX_PARTNER_NAME} characters.`;
  if (!ISO_DAY.test(input.date ?? "")) return "Pick a date.";
  if ((input.note ?? "").length > MAX_CONSIGNMENT_NOTE) return `Keep the note under ${MAX_CONSIGNMENT_NOTE} characters.`;
  if (input.kind === "settled") {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) return "Enter how much you paid the partner.";
    const owed = balanceOwed(existing, partner);
    if (amount > owed + 0.005) return `You only owe ${partner} ${Math.max(owed, 0).toFixed(2)} right now.`;
    return null;
  }
  const product = (input.productName ?? "").trim();
  if (!product) return "Name the product.";
  const qty = Number(input.qty);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) return "Enter a whole number of units.";
  if (input.kind === "placed") return null;
  const out = onConsignmentQty(existing, partner, product);
  if (input.kind === "returned" || input.kind === "sold") {
    if (qty > out) return `Only ${out} unit${out === 1 ? "" : "s"} of ${product} are with ${partner}.`;
  }
  if (input.kind === "sold") {
    const price = Number(input.unitPrice);
    if (!Number.isFinite(price) || price < 0) return "Enter the price per unit the partner sold at.";
    const share = Number(input.partnerSharePct);
    if (!Number.isFinite(share) || share < 0 || share > 100) return "The partner's share should be from 0 to 100 percent.";
  }
  return null;
}

export interface ConsignmentPartnerRow {
  partner: string;
  placedQty: number;
  soldQty: number;
  returnedQty: number;
  withPartnerQty: number;
  reportedSales: number;
  owedToPartner: number;
  settled: number;
  balance: number; // what you owe the partner (negative = they owe you)
  yourShareOfSales: number; // reported sales less what the partner keeps
}

// One row per partner, the ones owed the most first.
export function summarizeConsignments(entries: ConsignmentEntry[]): ConsignmentPartnerRow[] {
  const byPartner = new Map<string, ConsignmentPartnerRow & { _name: string }>();
  for (const e of entries) {
    const key = keyOf(e.partner);
    if (!key) continue;
    const row =
      byPartner.get(key) ??
      { _name: e.partner.trim(), partner: e.partner.trim(), placedQty: 0, soldQty: 0, returnedQty: 0, withPartnerQty: 0, reportedSales: 0, owedToPartner: 0, settled: 0, balance: 0, yourShareOfSales: 0 };
    if (e.kind === "placed") row.placedQty += e.qty ?? 0;
    if (e.kind === "returned") row.returnedQty += e.qty ?? 0;
    if (e.kind === "sold") {
      row.soldQty += e.qty ?? 0;
      const sales = (e.qty ?? 0) * (e.unitPrice ?? 0);
      row.reportedSales += sales;
      row.owedToPartner += (sales * (e.partnerSharePct ?? 0)) / 100;
    }
    if (e.kind === "settled") row.settled += e.amount ?? 0;
    byPartner.set(key, row);
  }
  return [...byPartner.values()]
    .map(({ _name, ...r }) => {
      const withPartnerQty = r.placedQty - r.soldQty - r.returnedQty;
      const reportedSales = round2(r.reportedSales);
      const owed = round2(r.owedToPartner);
      const settled = round2(r.settled);
      return {
        ...r,
        partner: _name,
        withPartnerQty,
        reportedSales,
        owedToPartner: owed,
        settled,
        balance: round2(owed - settled),
        yourShareOfSales: round2(reportedSales - owed),
      };
    })
    .sort((a, b) => b.balance - a.balance || a.partner.localeCompare(b.partner));
}
