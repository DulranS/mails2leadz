// Part deliveries on web orders (v277). An order can now be delivered in parts: each line records how much of it has been delivered so far. A delivery
// can never be more than what is still outstanding on that line. The order's deliveredOn date is set only when every line is complete, so the screens that
// already read deliveredOn (the run, the promise, the daily job) keep meaning "fully delivered". Pure.

export interface PdLine { name: string; qty: number; unitPrice?: number; deliveredQty?: number }
export type PartStatus = "open" | "part_delivered" | "delivered";

const r2 = (n: number) => Math.round(n * 100) / 100;
export const outstandingOf = (l: PdLine) => Math.max(0, r2(l.qty - (l.deliveredQty ?? 0)));

export function orderDeliveryState(lines: PdLine[]) {
  const rows = lines.map((l) => ({ name: l.name, ordered: l.qty, delivered: r2(l.deliveredQty ?? 0), outstanding: outstandingOf(l) }));
  const deliveredValue = r2(lines.reduce((t, l) => t + (l.deliveredQty ?? 0) * (l.unitPrice ?? 0), 0));
  const outstandingValue = r2(lines.reduce((t, l) => t + outstandingOf(l) * (l.unitPrice ?? 0), 0));
  const allDone = rows.every((r) => r.outstanding === 0);
  const anyDone = rows.some((r) => r.delivered > 0);
  const status: PartStatus = allDone ? "delivered" : anyDone ? "part_delivered" : "open";
  return { rows, status, deliveredValue, outstandingValue };
}

// Record delivering `qtyNow` of line `index` on `date`. Returns the new lines, and the date to set on the order only if it is now fully delivered.
export function recordPartDelivery(lines: PdLine[], index: number, qtyNow: number, date: string):
  { ok: true; lines: PdLine[]; fullyDelivered: boolean; deliveredOn?: string } | { ok: false; error: string } {
  const line = lines[index];
  if (!line) return { ok: false, error: "That line is not on this order." };
  if (!Number.isFinite(qtyNow) || qtyNow <= 0) return { ok: false, error: "Enter a quantity above zero." };
  const real = /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(Date.parse(`${date}T00:00:00Z`)).toISOString().slice(0, 10) === date;
  if (!real) return { ok: false, error: "Use a real date." };
  const left = outstandingOf(line);
  if (qtyNow > left) return { ok: false, error: `Only ${left} of ${line.name} is left to deliver.` };
  const next = lines.map((l, i) => (i === index ? { ...l, deliveredQty: r2((l.deliveredQty ?? 0) + qtyNow) } : l));
  const fullyDelivered = next.every((l) => outstandingOf(l) === 0);
  return { ok: true, lines: next, fullyDelivered, deliveredOn: fullyDelivered ? date : undefined };
}

// Mark the whole order delivered: every line is brought up to its full quantity.
export function completeAll(lines: PdLine[]): PdLine[] {
  return lines.map((l) => ({ ...l, deliveredQty: l.qty }));
}

// Invoicing per delivery (v278). An order can be set to record its sales as each part is delivered, instead of all at confirmation. Each delivery then creates
// its own sales, numbered as its own invoice (the order id, then -D1, -D2 ...). A delivery is billed only for what it adds, so nothing is billed twice.
// Orders that do not use this keep the confirmation-time sales they already have. A line with no product cannot move stock, so it is reported, not billed.
export interface DeliveryPost { name: string; productId: string; qty: number; unitPrice: number; invoiceId: string }
export function deliveryPosts(
  order: { id: string; recognition?: string; deliveryInvoices?: number; lines: (PdLine & { productId?: string })[] },
  before: PdLine[],
  after: PdLine[],
): { posts: DeliveryPost[]; missing: string[] } {
  if (order.recognition !== "delivery") return { posts: [], missing: [] };
  const n = (order.deliveryInvoices ?? 0) + 1;
  const posts: DeliveryPost[] = [];
  const missing: string[] = [];
  after.forEach((l, i) => {
    const added = r2((l.deliveredQty ?? 0) - (before[i]?.deliveredQty ?? 0));
    if (added <= 0) return;
    const pid = (order.lines[i] as { productId?: string })?.productId;
    if (!pid) { missing.push(l.name); return; }
    posts.push({ name: l.name, productId: pid, qty: added, unitPrice: l.unitPrice ?? 0, invoiceId: `${order.id}-D${n}` });
  });
  return { posts, missing };
}
