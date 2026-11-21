// Kitchen tickets and paying for part of a tab (cafés and restaurants). A ticket is the items sent to the kitchen together; the
// same item is never sent twice (only what is on the tab and not yet on a ticket is sent). Paying for part of a tab takes those
// items off the tab as they are paid, and the rest stays open, so one table can split its bill between people. Pure.
import type { KitchenStatus, KitchenTicket, TabLine } from "./types";

export const KITCHEN_STATUSES: KitchenStatus[] = ["new", "preparing", "ready", "served"];

export const KITCHEN_LABEL: Record<KitchenStatus, string> = {
  new: "New",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
};

// The line a quantity belongs to: the same item at the same price is one line on the tab.
export const lineKey = (l: { productId: string; unitPrice: number }) => `${l.productId}|${l.unitPrice}`;

// How many of each line have already gone to the kitchen, across every ticket on the tab.
export function sentQty(tickets: KitchenTicket[] | undefined): Map<string, number> {
  const sent = new Map<string, number>();
  for (const t of tickets ?? []) {
    for (const i of t.items) {
      const k = lineKey(i);
      sent.set(k, (sent.get(k) ?? 0) + i.qty);
    }
  }
  return sent;
}

// What is on the tab but not yet sent to the kitchen, as lines with the quantity still to send. Empty when all of it has gone.
export function unsentLines(lines: TabLine[], tickets: KitchenTicket[] | undefined): { productId: string; name: string; qty: number; unitPrice: number }[] {
  const sent = sentQty(tickets);
  const out: { productId: string; name: string; qty: number; unitPrice: number }[] = [];
  for (const l of lines) {
    const left = l.qty - (sent.get(lineKey(l)) ?? 0);
    if (left > 0) out.push({ productId: l.productId, name: l.name, qty: left, unitPrice: l.unitPrice });
  }
  return out;
}

// A new ticket from what is still unsent. Null when there is nothing to send.
export function newTicket(unsent: { productId: string; name: string; qty: number; unitPrice: number }[], id: string, now: number): KitchenTicket | null {
  if (unsent.length === 0) return null;
  return { id, items: unsent.map((i) => ({ productId: i.productId, name: i.name, qty: i.qty, unitPrice: i.unitPrice })), status: "new", sentAt: now };
}

// The next step on the kitchen's board. Served stays served.
export function nextKitchenStatus(s: KitchenStatus): KitchenStatus {
  if (s === "new") return "preparing";
  if (s === "preparing") return "ready";
  return "served";
}

// Tickets still waiting on the kitchen across open tabs, oldest first.
export function kitchenQueue<T extends { id: string; table: string; status: string; tickets?: KitchenTicket[] }>(
  tabs: T[]
): { tabId: string; table: string; ticket: KitchenTicket }[] {
  const out: { tabId: string; table: string; ticket: KitchenTicket }[] = [];
  for (const t of tabs) {
    if (t.status !== "open") continue;
    for (const ticket of t.tickets ?? []) {
      if (ticket.status !== "served") out.push({ tabId: t.id, table: t.table, ticket });
    }
  }
  return out.sort((a, b) => a.ticket.sentAt - b.ticket.sentAt);
}

// Which items to pay for now: pick[lineKey] = quantity, each a whole number from 0 to what is on the tab. Returns what is paid,
// what stays on the tab, and a sentence when the choice cannot be used.
export function partPaymentPlan(lines: TabLine[], pick: Record<string, number>): { paid: TabLine[]; remaining: TabLine[]; error: string | null } {
  const paid: TabLine[] = [];
  const remaining: TabLine[] = [];
  for (const l of lines) {
    const want = pick[lineKey(l)] ?? 0;
    if (!Number.isInteger(want) || want < 0 || want > l.qty) {
      return { paid: [], remaining: [], error: `Pick between 0 and ${l.qty} of ${l.name}.` };
    }
    if (want > 0) paid.push({ ...l, qty: want });
    if (l.qty - want > 0) remaining.push({ ...l, qty: l.qty - want });
  }
  if (paid.length === 0) return { paid: [], remaining: [], error: "Pick at least one item to pay for." };
  return { paid, remaining, error: null };
}
