// Cycle counting (v203b): stock is classified by value (ABC), and each item is counted on a cadence that matches its value. The high-value
// items are counted most often. A product's last count is the latest count correction recorded for it. Pure: the caller passes the stock
// values, the adjustments and today.

export type StockClass = "A" | "B" | "C";
export const CYCLE_CADENCE_DAYS: Record<StockClass, number> = { A: 30, B: 90, C: 365 };
export const A_CUTOFF_PCT = 80; // the items that make up the first 80% of stock value are A
export const B_CUTOFF_PCT = 95; // the next 15% are B; the rest are C

export interface CycleCountItem {
  productId: string;
  name: string;
  value: number;
  cls: StockClass;
  lastCounted: string | null;
  dueOn: string;
  daysLate: number; // 0 when not yet late; positive when past due
  due: boolean;
}

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// The latest count correction per product, as an ISO day. Other adjustments (breakage, theft, spoilage) are not counts.
export function lastCountedByProduct(adjustments: { productId: string; reason: string; date: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of adjustments) {
    if (a.reason !== "count_correction") continue;
    const prev = out.get(a.productId);
    if (!prev || a.date > prev) out.set(a.productId, a.date);
  }
  return out;
}

// Classify the stock that is held (value above zero) by its share of total value, most valuable first.
export function classifyByValue(items: { productId: string; name: string; value: number }[]): { productId: string; name: string; value: number; cls: StockClass }[] {
  const held = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = held.reduce((t, i) => t + i.value, 0);
  let before = 0;
  return held.map((i) => {
    const beforePct = total > 0 ? (before / total) * 100 : 0;
    before += i.value;
    const cls: StockClass = beforePct < A_CUTOFF_PCT ? "A" : beforePct < B_CUTOFF_PCT ? "B" : "C";
    return { ...i, cls };
  });
}

export function cycleCountPlan(
  items: { productId: string; name: string; value: number }[],
  adjustments: { productId: string; reason: string; date: string }[],
  today: string,
): CycleCountItem[] {
  const last = lastCountedByProduct(adjustments);
  return classifyByValue(items)
    .map((i) => {
      const lastCounted = last.get(i.productId) ?? null;
      const cadence = CYCLE_CADENCE_DAYS[i.cls];
      const dueOn = lastCounted ? addDays(lastCounted, cadence) : today;
      const daysLate = Math.max(0, dayDiff(dueOn, today));
      return { productId: i.productId, name: i.name, value: Math.round(i.value * 100) / 100, cls: i.cls, lastCounted, dueOn, daysLate, due: dueOn <= today };
    })
    .sort((a, b) => Number(b.due) - Number(a.due) || a.cls.localeCompare(b.cls) || b.daysLate - a.daysLate);
}
