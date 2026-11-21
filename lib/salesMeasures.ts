// Standard sales measures (v201b): three measures every sales business tracks, worked out from the sales and leads already recorded, so
// nobody types them in. A KPI can be set to follow one of them, in which case its figure is the live measure and not a typed reading.
// Pure: the caller passes the records and today.

export type SalesMeasureKey = "avg_order_value" | "repeat_rate" | "lead_conversion";

export const SALES_MEASURES: { key: SalesMeasureKey; label: string; unit: string; blurb: string }[] = [
  { key: "avg_order_value", label: "Average order value (last 30 days)", unit: "", blurb: "Revenue divided by the number of orders, over the last 30 days." },
  { key: "repeat_rate", label: "Repeat customers (last 90 days)", unit: "%", blurb: "Customers who ordered more than once, as a share of everyone who ordered in the last 90 days." },
  { key: "lead_conversion", label: "Lead conversion (leads from the last 30 days)", unit: "%", blurb: "Leads that were won, as a share of the leads that came in over the last 30 days." },
];

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;
const cust = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export type SalesMeasureValues = {
  avg_order_value: number | null;
  repeat_rate: number | null;
  lead_conversion: number | null;
};

export function computeSalesMeasures(
  sales: { id: string; date: string; qty: number; unitPrice: number; invoiceId?: string; customer?: string }[],
  leads: { createdAt: number; stage: string }[],
  today: string,
  nowMs: number,
): SalesMeasureValues {
  const from30 = addDays(today, -29);
  const from90 = addDays(today, -89);
  let revenue30 = 0;
  const orders30 = new Set<string>();
  const ordersByCustomer = new Map<string, Set<string>>();
  for (const s of sales) {
    const value = s.qty * s.unitPrice;
    if (!(value > 0) || s.date > today) continue;
    const orderKey = s.invoiceId ?? s.id;
    if (s.date >= from30) {
      revenue30 += value;
      orders30.add(orderKey);
    }
    if (s.date >= from90 && s.customer && cust(s.customer)) {
      const k = cust(s.customer);
      ordersByCustomer.set(k, (ordersByCustomer.get(k) ?? new Set()).add(orderKey));
    }
  }
  const customers90 = ordersByCustomer.size;
  const repeat = [...ordersByCustomer.values()].filter((o) => o.size >= 2).length;
  const from30ms = nowMs - 30 * DAY;
  const cohort = leads.filter((l) => l.createdAt >= from30ms && l.createdAt <= nowMs);
  const won = cohort.filter((l) => l.stage === "won").length;
  return {
    avg_order_value: orders30.size ? Math.round((revenue30 / orders30.size) * 100) / 100 : null,
    repeat_rate: customers90 ? round1((repeat / customers90) * 100) : null,
    lead_conversion: cohort.length ? round1((won / cohort.length) * 100) : null,
  };
}

// A KPI that follows a standard measure takes its single reading from the live figure. A KPI that does not is left as it is.
export function kpiWithLive<T extends { source?: string; readings?: { id: string; period: string; value: number }[] }>(
  k: T,
  live: Record<string, number | null>,
  today: string,
): T {
  if (!k.source || !(k.source in live)) return k;
  const v = live[k.source];
  return { ...k, readings: v === null ? [] : [{ id: "live", period: today, value: v }] };
}
