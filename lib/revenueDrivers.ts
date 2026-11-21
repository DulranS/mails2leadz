// Where revenue came from: how many customers, how often each ordered, how big each order was.
//
// Revenue = customers x orders per customer x average order. All three are in the books; this puts them on one line and
// compares the last 12 months with the 12 before, so "sales are up 12%" becomes "up because you have more customers, while
// each orders less often". The product is exact by construction (revenue is divided into orders and orders into customers,
// never estimated).
//
// Only sales with a customer name can be counted by customer; sales without one are reported separately as unattributed so
// the figure is never silently incomplete. An order is one invoice, or a lone sale (late charges billed are not orders), and
// revenue is before tax: the same definitions as the Ordering rhythm (lib/orderFrequency.ts). Read-only.

import type { OrderSale } from "./orderFrequency";

export interface DriverPeriod {
  customers: number;
  orders: number;
  revenue: number; // before tax, named customers only
  ordersPerCustomer: number; // orders / customers
  avgOrder: number; // revenue / orders
}

export interface RevenueDrivers {
  current: DriverPeriod;
  previous: DriverPeriod | null; // null when the 12 months before had no orders to compare with
  // Percent change of each lever and of revenue, null when there is no previous period.
  change: { customersPct: number; ordersPerCustomerPct: number; avgOrderPct: number; revenuePct: number } | null;
  biggestLever: "customers" | "ordersPerCustomer" | "avgOrder" | null; // what moved revenue most, in either direction
  unattributedRevenue: number; // current period revenue from sales with no customer name
  unattributedSharePct: number | null; // of all current-period revenue
}

const DAY = 86400000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const parse = (iso: string) => Date.parse(iso + "T00:00:00Z");
const addDays = (iso: string, n: number) => new Date(parse(iso) + n * DAY).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (now: number, before: number) => Math.round((now / before - 1) * 1000) / 10;

function period(sales: OrderSale[], from: string, to: string): { p: DriverPeriod | null; unattributed: number } {
  const customers = new Set<string>();
  const orders = new Set<string>();
  let revenue = 0;
  let unattributed = 0;
  for (const s of sales) {
    if (s.lateFeeForKey || !ISO.test(s.date) || s.date <= from || s.date > to) continue;
    const line = s.unitPrice * s.qty;
    if (!Number.isFinite(line)) continue;
    const name = (s.customer ?? "").trim().toLowerCase();
    if (name === "") { unattributed += line; continue; }
    customers.add(name);
    orders.add(`${name}|${s.invoiceId ? `inv:${s.invoiceId}` : `sale:${s.id}`}`);
    revenue += line;
  }
  if (orders.size === 0) return { p: null, unattributed };
  return {
    p: { customers: customers.size, orders: orders.size, revenue: r2(revenue), ordersPerCustomer: Math.round((orders.size / customers.size) * 100) / 100, avgOrder: r2(revenue / orders.size) },
    unattributed,
  };
}

export function computeRevenueDrivers(sales: OrderSale[], asOfISO: string): RevenueDrivers | null {
  if (!ISO.test(asOfISO)) return null;
  const mid = addDays(asOfISO, -365);
  const start = addDays(asOfISO, -730);
  const cur = period(sales, mid, asOfISO);
  if (!cur.p) return null;
  const prev = period(sales, start, mid);
  let change: RevenueDrivers["change"] = null;
  let biggest: RevenueDrivers["biggestLever"] = null;
  if (prev.p && prev.p.revenue > 0 && cur.p.revenue > 0) {
    const c = cur.p, p = prev.p;
    change = {
      customersPct: pct(c.customers, p.customers),
      ordersPerCustomerPct: pct(c.orders / c.customers, p.orders / p.customers),
      avgOrderPct: pct(c.revenue / c.orders, p.revenue / p.orders),
      revenuePct: pct(c.revenue, p.revenue),
    };
    const moves: [NonNullable<RevenueDrivers["biggestLever"]>, number][] = [
      ["customers", Math.abs(Math.log(c.customers / p.customers))],
      ["ordersPerCustomer", Math.abs(Math.log(c.orders / c.customers / (p.orders / p.customers)))],
      ["avgOrder", Math.abs(Math.log(c.revenue / c.orders / (p.revenue / p.orders)))],
    ];
    moves.sort((a, b) => b[1] - a[1]);
    biggest = moves[0][1] < 1e-9 ? null : moves[0][0];
  }
  const total = cur.p.revenue + cur.unattributed;
  return {
    current: cur.p,
    previous: prev.p,
    change,
    biggestLever: biggest,
    unattributedRevenue: r2(cur.unattributed),
    unattributedSharePct: total > 0 ? Math.round((cur.unattributed / total) * 1000) / 10 : null,
  };
}
