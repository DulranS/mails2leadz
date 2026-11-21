// Purchase order approval (v183b). An owner can set an amount above which a new purchase order must be approved before it counts as
// committed. Until approved it waits as "awaiting approval": it is not open for receiving and not sent to the supplier-facing order list.
// Pure: no I/O.
import type { OrderStatus } from "./types";

export const PO_AWAITING: OrderStatus = "awaiting_approval";
export const PO_MAX_THRESHOLD = 10_000_000;
export const PO_REJECTION_NOTE_MAX = 300;

export function orderCost(qty: number, unitCost: number): number {
  return Math.round(qty * unitCost * 100) / 100;
}

// Whether a new order of this value needs approval. Zero or no threshold means approval is not required.
export function needsPoApproval(qty: number, unitCost: number, threshold: number | undefined): boolean {
  if (!threshold || threshold <= 0) return false;
  return orderCost(qty, unitCost) > threshold;
}

export function validatePoThreshold(n: number): string | null {
  if (!Number.isFinite(n) || n < 0 || n > PO_MAX_THRESHOLD) return `The amount must be from 0 to ${PO_MAX_THRESHOLD.toLocaleString("en")}. 0 turns approval off.`;
  return null;
}

// Committed orders are the ones the business has decided to buy: ordered, on the way, or received.
export function isCommitted(status: OrderStatus): boolean {
  return status === "ordered" || status === "in_transit" || status === "received";
}

export type PoDecisionPlan =
  | { ok: true; patch: { status: OrderStatus; approvedByName: string; approvedAt: number; rejectionNote?: string } }
  | { ok: false; error: string };

export function decidePoApproval(
  po: { status: OrderStatus },
  decision: "approved" | "rejected",
  by: { role: string; name: string },
  at: number,
  note?: string,
): PoDecisionPlan {
  if (po.status !== PO_AWAITING) return { ok: false, error: "This order is not waiting for approval." };
  if (by.role !== "owner" && by.role !== "manager") return { ok: false, error: "Only an owner or manager can approve an order." };
  if (decision === "approved") return { ok: true, patch: { status: "ordered", approvedByName: by.name, approvedAt: at } };
  const cleanNote = (note ?? "").replace(/\s+/g, " ").trim().slice(0, PO_REJECTION_NOTE_MAX);
  return { ok: true, patch: { status: "cancelled", approvedByName: by.name, approvedAt: at, ...(cleanNote ? { rejectionNote: cleanNote } : {}) } };
}
