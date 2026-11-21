// PayHere card payments for customer invoices. Pure: no I/O. Formulas follow PayHere's Checkout API documentation:
//   checkout hash  = UPPER( MD5( merchant_id + order_id + amount + currency + UPPER(MD5(merchant_secret)) ) )
//   notify md5sig  = UPPER( MD5( merchant_id + order_id + payhere_amount + payhere_currency + status_code + UPPER(MD5(merchant_secret)) ) )
// A payment counts only when the md5sig matches, status_code is "2", and the amount and currency are the ones this app asked for.
// Each business uses its OWN PayHere merchant ID and secret. Balancr never holds the money.
import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const PAYHERE_CHECKOUT_URL = {
  sandbox: "https://sandbox.payhere.lk/pay/checkout",
  live: "https://www.payhere.lk/pay/checkout",
} as const;

const md5Upper = (s: string) => createHash("md5").update(s).digest("hex").toUpperCase();

export function formatPayhereAmount(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function payhereCheckoutHash(merchantId: string, orderId: string, amount: string, currency: string, merchantSecret: string): string {
  return md5Upper(merchantId + orderId + amount + currency + md5Upper(merchantSecret));
}

export function payhereNotifySig(
  merchantId: string,
  orderId: string,
  payhereAmount: string,
  payhereCurrency: string,
  statusCode: string,
  merchantSecret: string
): string {
  return md5Upper(merchantId + orderId + payhereAmount + payhereCurrency + statusCode + md5Upper(merchantSecret));
}

// A random order reference the gateway echoes back. Unguessable, so a notification cannot be aimed at an order we did not create.
export function newPayhereOrderId(): string {
  return randomBytes(12).toString("hex").toUpperCase();
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface PayhereNotice {
  merchant_id: string;
  order_id: string;
  payhere_amount: string;
  payhere_currency: string;
  status_code: string;
  md5sig: string;
}

// True only for a genuine, successful notification for the order we expect. Anything else is ignored.
export function payhereNoticeIsPaid(
  notice: PayhereNotice,
  expected: { merchantId: string; orderId: string; amount: string; currency: string },
  merchantSecret: string
): boolean {
  if (notice.merchant_id !== expected.merchantId) return false;
  if (notice.order_id !== expected.orderId) return false;
  if (notice.payhere_currency !== expected.currency) return false;
  if (notice.payhere_amount !== expected.amount) return false;
  if (notice.status_code !== "2") return false;
  const local = payhereNotifySig(notice.merchant_id, notice.order_id, notice.payhere_amount, notice.payhere_currency, notice.status_code, merchantSecret);
  return sameText(local, notice.md5sig.toUpperCase());
}
