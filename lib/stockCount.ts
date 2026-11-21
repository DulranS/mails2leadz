// Physical stock count (stocktake): walk the shelves, type what is really there, and record every difference in one go.
//
// The differences are ordinary stock adjustments (reason "count_correction"), the same record the one-item adjustment
// form makes: never revenue and never cost of goods, but they DO reach profit through the stock shrinkage line (a shortage
// is a loss at average cost, extra stock a gain), exactly like a single adjustment (see StockAdjustment in lib/types.ts). The difference is worked out when the count is RECORDED, against the stock on hand at that moment,
// not against what the screen showed when the count began: a sale made while counting is then not double counted.

export const MAX_COUNT_LINES = 400; // one batch write holds at most 500 documents; stay well inside

export interface ParsedCount {
  value: number | null; // null = left blank = not counted, leave this item alone
  error?: string;
}

// What was typed in a "counted" box. Blank is "not counted", never zero (zero is a real count: the shelf is empty).
export function parseCounted(text: string, allowFractional: boolean): ParsedCount {
  const t = (text ?? "").trim();
  if (t === "") return { value: null };
  if (!/^\d+(\.\d+)?$/.test(t)) return { value: null, error: "Enter a number, 0 or more" };
  const n = Number(t);
  if (!Number.isFinite(n)) return { value: null, error: "Enter a number, 0 or more" };
  if (!allowFractional && !Number.isInteger(n)) return { value: null, error: "Whole units only for this item" };
  return { value: Math.round(n * 10000) / 10000 };
}

const q4 = (n: number) => Math.round(n * 10000) / 10000;

// Counted minus what the books say. Null while not counted.
export function countVariance(system: number, counted: number | null): number | null {
  if (counted === null || !Number.isFinite(counted) || !Number.isFinite(system)) return null;
  const v = q4(counted - system);
  return Math.abs(v) < 1e-9 ? 0 : v;
}

export interface CountInput {
  productId: string;
  counted: number | null;
  system: number; // stock on hand now, per the books
}

export interface CountPlan {
  adjustments: { productId: string; qty: number }[]; // signed: negative = short, positive = found
  counted: number; // items actually counted
  matching: number; // counted and equal to the books
}

// Only items that were counted AND differ become adjustments. Throws in words when there are too many for one batch.
export function planStockCount(lines: CountInput[]): CountPlan {
  const adjustments: { productId: string; qty: number }[] = [];
  let counted = 0;
  let matching = 0;
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.productId)) continue; // one count per item
    seen.add(l.productId);
    const v = countVariance(l.system, l.counted);
    if (v === null) continue;
    counted += 1;
    if (v === 0) matching += 1;
    else adjustments.push({ productId: l.productId, qty: v });
  }
  if (adjustments.length > MAX_COUNT_LINES) {
    throw new Error(`That is ${adjustments.length} differences at once. Record the count in parts of ${MAX_COUNT_LINES} or fewer (count one category at a time).`);
  }
  return { adjustments, counted, matching };
}

// Money value of a difference at the item's current average cost. This is what the count does to profit (a shortage is
// booked as stock shrinkage), so the count sheet shows it before you record.
export function varianceValue(variance: number | null, wac: number): number | null {
  if (variance === null || !Number.isFinite(wac)) return null;
  return Math.round(variance * wac * 100) / 100;
}
