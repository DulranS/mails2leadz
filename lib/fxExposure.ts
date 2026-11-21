// Foreign-currency exposure: how much of what customers still owe you, and what you still owe suppliers, was
// booked in a foreign currency, and what a move in that currency would do to it.
//
// Read-only and derived. It changes no sale, purchase, payment or statement figure. Foreign amounts are translated
// to the business currency ONCE, at the rate typed on the day (see lib/fx.ts), and payments are recorded in the
// business currency. So the honest statement is "what is still unpaid, valued at the rates you booked it at", and
// "if that currency moves X%, the same unpaid balance is worth X% more or less". It never claims a realised gain or a
// revaluation, and nothing here is posted to the books. The live reference rate (lib/liveRates.ts) is shown beside these
// figures as a what-if only; it never replaces a booked rate.
//
// Opening balances carry no currency and are left out (they are treated as business currency, as everywhere).
import type { PayableLine, ReceivableLine } from "./calculations";
import type { Purchase, Sale } from "./types";

export interface FxExposureRow {
  currency: string;
  receivable: number; // still owed to you, business currency, at booked rates
  payable: number; // still owed to suppliers, business currency, at booked rates
  net: number; // receivable - payable: positive = you gain if the currency strengthens, negative = you lose
  receivableCount: number;
  payableCount: number;
  avgRate: number | null; // weighted average booked rate (1 unit of currency = this many business-currency units)
  oldestDate: string | null; // oldest unpaid foreign-currency item, ISO date
  receivableUnits: number; // the foreign amount behind receivable (each item divided by the rate it was booked at)
  payableUnits: number; // the foreign amount behind payable, the same way
}

export interface FxExposure {
  baseCurrency: string;
  rows: FxExposureRow[]; // largest exposure first
  foreignReceivable: number;
  foreignPayable: number;
  foreignNet: number;
  foreignShareOfReceivables: number | null; // 0..1 of all money owed to you, null when nothing is owed
  foreignShareOfPayables: number | null; // 0..1 of all you owe suppliers, null when nothing is owed
}

const cur = (c: string | undefined | null) => (c ?? "").trim().toUpperCase();

interface Bucket {
  receivable: number;
  payable: number;
  receivableCount: number;
  payableCount: number;
  foreignUnits: number; // sum of base / rate, to get a weighted average rate
  baseWithRate: number;
  oldest: string | null;
  recvUnits: number;
  payUnits: number;
}

export function computeFxExposure(input: {
  receivables: ReceivableLine[];
  payables: PayableLine[];
  sales: Sale[];
  purchases: Purchase[];
  baseCurrency: string;
  totalReceivable: number; // receivablesAging.totalOutstanding, for the share
  totalPayable: number; // payablesAging.totalOutstanding, for the share
}): FxExposure {
  const base = cur(input.baseCurrency);
  const saleById = new Map(input.sales.map((s) => [s.id, s]));
  const purchaseById = new Map(input.purchases.map((p) => [p.id, p]));
  const buckets = new Map<string, Bucket>();

  const bucketFor = (c: string): Bucket => {
    let b = buckets.get(c);
    if (!b) {
      b = { receivable: 0, payable: 0, receivableCount: 0, payableCount: 0, foreignUnits: 0, baseWithRate: 0, oldest: null, recvUnits: 0, payUnits: 0 };
      buckets.set(c, b);
    }
    return b;
  };
  const note = (b: Bucket, amount: number, rate: number | undefined, date: string) => {
    if (rate && rate > 0) {
      b.foreignUnits += amount / rate;
      b.baseWithRate += amount;
    }
    if (!b.oldest || date < b.oldest) b.oldest = date;
  };

  for (const line of input.receivables) {
    let counted = false;
    for (const item of line.items) {
      if (!(item.amountOutstanding > 0.005)) continue;
      const sale = saleById.get(item.saleId);
      const c = cur(sale?.currency);
      if (!sale || !c || c === base) continue;
      const b = bucketFor(c);
      b.receivable += item.amountOutstanding;
      note(b, item.amountOutstanding, sale.exchangeRate, sale.date);
      if (sale.exchangeRate && sale.exchangeRate > 0) b.recvUnits += item.amountOutstanding / sale.exchangeRate;
      counted = true;
    }
    if (counted) {
      // One invoice counts once, in the currency of its first foreign line (an invoice is one currency in practice).
      const first = line.items.map((i) => cur(saleById.get(i.saleId)?.currency)).find((c) => c && c !== base);
      if (first) bucketFor(first).receivableCount += 1;
    }
  }

  for (const line of input.payables) {
    if (!(line.amountOutstanding > 0.005)) continue;
    const pur = purchaseById.get(line.purchaseId);
    const c = cur(pur?.currency);
    if (!pur || !c || c === base) continue;
    const b = bucketFor(c);
    b.payable += line.amountOutstanding;
    b.payableCount += 1;
    note(b, line.amountOutstanding, pur.exchangeRate, pur.date);
    if (pur.exchangeRate && pur.exchangeRate > 0) b.payUnits += line.amountOutstanding / pur.exchangeRate;
  }

  const rows: FxExposureRow[] = [...buckets.entries()].map(([currency, b]) => ({
    currency,
    receivable: b.receivable,
    payable: b.payable,
    net: b.receivable - b.payable,
    receivableCount: b.receivableCount,
    payableCount: b.payableCount,
    avgRate: b.foreignUnits > 0 ? b.baseWithRate / b.foreignUnits : null,
    oldestDate: b.oldest,
    receivableUnits: b.recvUnits,
    payableUnits: b.payUnits,
  }));
  rows.sort((a, b) => Math.max(b.receivable, b.payable) - Math.max(a.receivable, a.payable) || a.currency.localeCompare(b.currency));

  const foreignReceivable = rows.reduce((s, r) => s + r.receivable, 0);
  const foreignPayable = rows.reduce((s, r) => s + r.payable, 0);
  return {
    baseCurrency: base,
    rows,
    foreignReceivable,
    foreignPayable,
    foreignNet: foreignReceivable - foreignPayable,
    foreignShareOfReceivables: input.totalReceivable > 0.005 ? Math.min(1, foreignReceivable / input.totalReceivable) : null,
    foreignShareOfPayables: input.totalPayable > 0.005 ? Math.min(1, foreignPayable / input.totalPayable) : null,
  };
}

// What the net position gains (+) or loses (-) if the foreign currency gets `pct` % stronger against the business
// currency (pct > 0) or weaker (pct < 0). Receivables are worth more when the currency strengthens, payables cost more.
export function fxMoveImpact(net: number, pct: number): number {
  return (net * pct) / 100;
}
