// How often each customer orders, and who is overdue for their usual reorder.
//
// Retention (computeCustomerRetention) says how many customers were active this quarter versus last. This is the
// per-customer side: a customer who normally orders every 3 weeks and has not ordered for 9 is drifting away long before
// a quarterly figure shows it, and one who is "due" is a call worth making today.
//
// What counts as an order: one invoice (a goods line plus its delivery line is one order), or a single sale logged on
// its own. Late charges the owner billed are not orders. Cadence is read from distinct order DAYS (two orders on one
// day are one visit). A customer is identified by the name typed on the sale, matched case-insensitively and trimmed,
// the same way every other customer figure in the app is.
//
// Read-only: nothing is stored, sent or changed.

export interface OrderSale {
  id: string;
  date: string;
  customer?: string;
  invoiceId?: string;
  unitPrice: number;
  qty: number;
  lateFeeForKey?: string;
}

export type RhythmStatus = "regular" | "due" | "slipping" | "new" | "one_off";

export interface CustomerRhythm {
  key: string; // lower-cased, trimmed name
  name: string; // as first typed
  orders: number;
  orderDays: number; // distinct days with an order
  firstOrder: string;
  lastOrder: string;
  daysSinceLast: number;
  typicalGapDays: number | null; // median days between order days; null with a single order day
  lowConfidence: boolean; // the gap rests on one interval (two order days)
  expectedNext: string | null; // last order + typical gap
  status: RhythmStatus;
  avgOrderValue: number; // before tax, over all their orders
}

export const MIN_DAYS_TO_FLAG = 7; // a customer can't be "late" inside a week, whatever their rhythm
export const ONE_OFF_AFTER_DAYS = 90; // one order, this long ago: not "new" any more

const DAY = 86400000;
const parse = (iso: string) => Date.parse(iso + "T00:00:00Z");
const diffDays = (a: string, b: string) => Math.round((parse(b) - parse(a)) / DAY);
const addDays = (iso: string, n: number) => new Date(parse(iso) + n * DAY).toISOString().slice(0, 10);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function computeOrderRhythms(sales: OrderSale[], asOfISO: string): CustomerRhythm[] {
  if (!ISO.test(asOfISO)) return [];
  // order -> { date, value } per customer
  type Order = { date: string; value: number };
  const perCustomer = new Map<string, { name: string; orders: Map<string, Order> }>();
  for (const s of sales) {
    const name = (s.customer ?? "").trim();
    if (name === "" || s.lateFeeForKey || !ISO.test(s.date) || s.date > asOfISO) continue;
    const k = name.toLowerCase();
    const c = perCustomer.get(k) ?? { name, orders: new Map<string, Order>() };
    const orderKey = s.invoiceId ? `inv:${s.invoiceId}` : `sale:${s.id}`;
    const o = c.orders.get(orderKey) ?? { date: s.date, value: 0 };
    if (s.date < o.date) o.date = s.date;
    const line = s.unitPrice * s.qty;
    if (Number.isFinite(line)) o.value += line;
    c.orders.set(orderKey, o);
    perCustomer.set(k, c);
  }
  const out: CustomerRhythm[] = [];
  for (const [key, c] of perCustomer) {
    const orders = [...c.orders.values()];
    const days = Array.from(new Set(orders.map((o) => o.date))).sort();
    const gaps: number[] = [];
    for (let i = 1; i < days.length; i++) gaps.push(diffDays(days[i - 1], days[i]));
    const lastOrder = days[days.length - 1];
    const daysSinceLast = diffDays(lastOrder, asOfISO);
    const typical = gaps.length ? Math.max(1, median(gaps)) : null;
    let status: RhythmStatus;
    if (typical === null) status = daysSinceLast > ONE_OFF_AFTER_DAYS ? "one_off" : "new";
    else if (daysSinceLast < MIN_DAYS_TO_FLAG) status = "regular";
    else {
      const ratio = daysSinceLast / typical;
      status = ratio < 1 ? "regular" : ratio < 2 ? "due" : "slipping";
    }
    const total = orders.reduce((sum, o) => sum + o.value, 0);
    out.push({
      key,
      name: c.name,
      orders: orders.length,
      orderDays: days.length,
      firstOrder: days[0],
      lastOrder,
      daysSinceLast,
      typicalGapDays: typical === null ? null : Math.round(typical * 10) / 10,
      lowConfidence: gaps.length === 1,
      expectedNext: typical === null ? null : addDays(lastOrder, Math.round(typical)),
      status,
      avgOrderValue: Math.round((total / orders.length) * 100) / 100,
    });
  }
  const rank: Record<RhythmStatus, number> = { slipping: 0, due: 1, regular: 2, new: 3, one_off: 4 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || b.avgOrderValue - a.avgOrderValue || a.name.localeCompare(b.name));
}

export interface OrderFrequencySummary {
  activeCustomers: number; // ordered in the last 12 months
  repeatCustomers: number; // of those, on 2 or more different days in that window
  repeatRatePct: number | null; // repeat / active; null with no active customers
  avgOrdersPerCustomer: number | null; // orders in the window / active customers
  medianGapDays: number | null; // median of the customers' typical gaps (customers with 2+ order days, all time)
}

export function summarizeOrderFrequency(sales: OrderSale[], rhythms: CustomerRhythm[], asOfISO: string): OrderFrequencySummary {
  if (!ISO.test(asOfISO)) return { activeCustomers: 0, repeatCustomers: 0, repeatRatePct: null, avgOrdersPerCustomer: null, medianGapDays: null };
  const from = addDays(asOfISO, -365);
  const byCustomer = new Map<string, { days: Set<string>; orders: Set<string> }>();
  for (const s of sales) {
    const name = (s.customer ?? "").trim();
    if (name === "" || s.lateFeeForKey || !ISO.test(s.date) || s.date <= from || s.date > asOfISO) continue;
    const k = name.toLowerCase();
    const c = byCustomer.get(k) ?? { days: new Set<string>(), orders: new Set<string>() };
    c.days.add(s.date);
    c.orders.add(s.invoiceId ? `inv:${s.invoiceId}` : `sale:${s.id}`);
    byCustomer.set(k, c);
  }
  const active = byCustomer.size;
  const repeat = [...byCustomer.values()].filter((c) => c.days.size >= 2).length;
  const totalOrders = [...byCustomer.values()].reduce((n, c) => n + c.orders.size, 0);
  const gaps = rhythms.filter((r) => r.typicalGapDays !== null).map((r) => r.typicalGapDays as number);
  return {
    activeCustomers: active,
    repeatCustomers: repeat,
    repeatRatePct: active > 0 ? Math.round((repeat / active) * 1000) / 10 : null,
    avgOrdersPerCustomer: active > 0 ? Math.round((totalOrders / active) * 10) / 10 : null,
    medianGapDays: gaps.length ? Math.round(median(gaps) * 10) / 10 : null,
  };
}
