// POS sales ingest (passes 309-310). Pure: no I/O, so it can be checked offline.
// A point-of-sale signs each request with the account's POS key:
//   x-pos-timestamp: epoch milliseconds
//   x-pos-signature: hex HMAC-SHA256 of "<timestamp>.<raw request body>", keyed with the POS key
// Any vendor can send this shape; a middleware maps its own export to it.
import { createHash, createHmac, timingSafeEqual } from "crypto";

export const POS_TOLERANCE_MS = 5 * 60 * 1000;
export const POS_MAX_SALES = 500;
export const POS_PAYMENTS = ["cash", "card", "bank_transfer"] as const;
export type PosPayment = (typeof POS_PAYMENTS)[number];

export function signPosRequest(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyPosSignature(i: {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
  nowMs: number;
  toleranceMs?: number;
}): { ok: true } | { ok: false; error: string } {
  const ts = Number(i.timestamp);
  if (!i.timestamp || !Number.isFinite(ts)) return { ok: false, error: "Missing or bad x-pos-timestamp." };
  if (Math.abs(i.nowMs - ts) > (i.toleranceMs ?? POS_TOLERANCE_MS)) {
    return { ok: false, error: "The request is too old or from the future. Check the POS clock." };
  }
  const expected = Buffer.from(signPosRequest(i.secret, i.timestamp, i.body), "utf8");
  const given = Buffer.from((i.signature || "").trim().toLowerCase(), "utf8");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, error: "Signature does not match." };
  }
  return { ok: true };
}

export interface PosSaleLine {
  txId: string;
  date: string;
  product: string;
  qty: number;
  unitPrice: number;
  paymentMethod: PosPayment;
  customer: string;
  notes: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TX = /^[A-Za-z0-9._:-]{1,80}$/;

export function validatePosSales(b: unknown): { ok: true; value: PosSaleLine[] } | { ok: false; error: string } {
  if (!b || typeof b !== "object" || !Array.isArray((b as { sales?: unknown }).sales)) {
    return { ok: false, error: 'Send {"sales": [...]}.' };
  }
  const list = (b as { sales: unknown[] }).sales;
  if (list.length === 0) return { ok: false, error: "No sales in the request." };
  if (list.length > POS_MAX_SALES) return { ok: false, error: `At most ${POS_MAX_SALES} sales per request.` };
  const out: PosSaleLine[] = [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i] as Record<string, unknown> | null;
    const at = `sales[${i}]`;
    if (!s || typeof s !== "object") return { ok: false, error: `${at} must be an object.` };
    if (typeof s.txId !== "string" || !TX.test(s.txId)) {
      return { ok: false, error: `${at}.txId is required: letters, digits, . _ : - (up to 80).` };
    }
    if (typeof s.date !== "string" || !DATE.test(s.date) || Number.isNaN(Date.parse(s.date))) {
      return { ok: false, error: `${at}.date must be YYYY-MM-DD.` };
    }
    if (typeof s.product !== "string" || !s.product.trim()) return { ok: false, error: `${at}.product (name or SKU) is required.` };
    if (!(typeof s.qty === "number" && Number.isFinite(s.qty) && s.qty > 0 && s.qty < 1e9)) {
      return { ok: false, error: `${at}.qty must be a number above zero.` };
    }
    if (!(typeof s.unitPrice === "number" && Number.isFinite(s.unitPrice) && s.unitPrice >= 0 && s.unitPrice < 1e12)) {
      return { ok: false, error: `${at}.unitPrice must be a number, zero or more.` };
    }
    if (typeof s.paymentMethod !== "string" || !(POS_PAYMENTS as readonly string[]).includes(s.paymentMethod)) {
      return { ok: false, error: `${at}.paymentMethod must be cash, card or bank_transfer.` };
    }
    out.push({
      txId: s.txId,
      date: s.date,
      product: s.product.trim(),
      qty: s.qty,
      unitPrice: s.unitPrice,
      paymentMethod: s.paymentMethod as PosPayment,
      customer: typeof s.customer === "string" ? s.customer.slice(0, 200) : "",
      notes: typeof s.notes === "string" ? s.notes.slice(0, 500) : "",
    });
  }
  return { ok: true, value: out };
}

/** A stable id per business, transaction and line, so re-sending the same line never posts it twice. */
export function posSaleDocId(businessId: string, txId: string, lineIndex: number): string {
  return "pos_" + createHash("sha256").update(`${businessId}:${txId}:${lineIndex}`).digest("hex").slice(0, 40);
}

// Daily reconciliation (pass 311). The POS states its own day total; Balancr compares it with the sales it has posted
// for that date. Research (Xero/QuickBooks POS guides): reconcile the day's sales against the till's Z-out total.
export interface PosDayTotal { date: string; expectedTotal: number; expectedTransactions: number }

export function validatePosDayTotal(b: unknown): { ok: true; value: PosDayTotal } | { ok: false; error: string } {
  if (!b || typeof b !== "object") return { ok: false, error: "Send a JSON object." };
  const o = b as Record<string, unknown>;
  if (typeof o.date !== "string" || !DATE.test(o.date) || Number.isNaN(Date.parse(o.date))) {
    return { ok: false, error: "date must be YYYY-MM-DD." };
  }
  if (!(typeof o.expectedTotal === "number" && Number.isFinite(o.expectedTotal) && o.expectedTotal >= 0 && o.expectedTotal < 1e12)) {
    return { ok: false, error: "expectedTotal must be a number, zero or more." };
  }
  if (!(Number.isInteger(o.expectedTransactions) && (o.expectedTransactions as number) >= 0 && (o.expectedTransactions as number) < 1e7)) {
    return { ok: false, error: "expectedTransactions must be a whole number, zero or more." };
  }
  return { ok: true, value: { date: o.date, expectedTotal: o.expectedTotal as number, expectedTransactions: o.expectedTransactions as number } };
}

export interface ReconcileResult {
  status: "matched" | "mismatch";
  expectedTotal: number;
  postedTotal: number;
  difference: number;
  expectedTransactions: number;
  postedTransactions: number;
}

export function reconcileDay(i: {
  expectedTotal: number;
  expectedTransactions: number;
  postedTotal: number;
  postedTransactions: number;
}): ReconcileResult {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const difference = round2(i.expectedTotal - i.postedTotal);
  const matched = Math.abs(difference) <= 0.01 && i.expectedTransactions === i.postedTransactions;
  return {
    status: matched ? "matched" : "mismatch",
    expectedTotal: round2(i.expectedTotal),
    postedTotal: round2(i.postedTotal),
    difference,
    expectedTransactions: i.expectedTransactions,
    postedTransactions: i.postedTransactions,
  };
}

// The posted POS sales for one day, as the reconciliation compares them (pass 313). Shared by the till's signed route and
// the owner's check, so both count the same way.
export interface PostedSaleLike { qty?: number; unitPrice?: number; posRef?: string }
export function summarisePostedPos(sales: PostedSaleLike[]): { postedTotal: number; postedTransactions: number } {
  let postedTotal = 0;
  const refs = new Set<string>();
  for (const s of sales) {
    postedTotal += (Number(s.qty) || 0) * (Number(s.unitPrice) || 0);
    if (s.posRef) refs.add(s.posRef);
  }
  return { postedTotal, postedTransactions: refs.size };
}

// One saved POS day check, shaped for the POS days list (pass 340). Pure: the route reads the documents, this only tidies them.
export interface PosDayRow {
  date: string;
  status: "matched" | "mismatch";
  expectedTotal: number;
  postedTotal: number;
  difference: number;
  expectedTransactions: number;
  postedTransactions: number;
  checkedAt: string;
}

export function posDayRow(id: string, data: Record<string, unknown>): PosDayRow {
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0);
  return {
    date: String(data.date || id),
    status: data.status === "matched" ? "matched" : "mismatch",
    expectedTotal: num(data.expectedTotal),
    postedTotal: num(data.postedTotal),
    difference: num(data.difference),
    expectedTransactions: Math.trunc(num(data.expectedTransactions)),
    postedTransactions: Math.trunc(num(data.postedTransactions)),
    checkedAt: String(data.checkedAt || ""),
  };
}
