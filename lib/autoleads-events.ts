// Event sender for AutoLeads (v319): builds the "invoice.paid" event, signs it, and sends it. Pure apart from the one POST, which takes
// the fetch to use so the verifier can mock it. Nothing here throws to the caller: a failed send comes back as { sent: false, reason }
// and the payment that triggered it is never blocked.
//
// Signature: X-Balancr-Signature is the hex HMAC-SHA256, keyed with BALANCR_EVENT_SECRET, of `${timestamp}.${rawBody}`, where timestamp is
// X-Balancr-Timestamp (milliseconds since the epoch). The receiver checks the signature over the exact body it received.
import { createHmac } from "crypto";

export const AUTOLEADS_EVENT_TYPE = "invoice.paid";
export const AUTOLEADS_EVENT_TIMEOUT_MS = 5000;

export interface InvoicePaidInput {
  businessId: string;
  ownerUid: string; // the AutoLeads user id saved in this business's AutoLeads connection settings
  invoiceId: string;
  customerEmail: string | null;
  amount: number;
  currency: string;
  paidOn: string; // YYYY-MM-DD
  occurredAt: number; // ms since the epoch
}

export interface AutoLeadsEvent {
  id: string;
  type: typeof AUTOLEADS_EVENT_TYPE;
  businessId: string;
  ownerUid: string;
  occurredAt: string;
  data: { invoiceNumber: string; customerEmail: string | null; amount: number; currency: string; paidOn: string };
}

/** The event body. The id is "<invoiceId>:paid", so a repeat send of the same paid invoice carries the same id for the receiver to merge. */
export function buildEvent(i: InvoicePaidInput): AutoLeadsEvent {
  return {
    id: `${i.invoiceId}:paid`,
    type: AUTOLEADS_EVENT_TYPE,
    businessId: i.businessId,
    ownerUid: i.ownerUid,
    occurredAt: new Date(i.occurredAt).toISOString(),
    data: {
      invoiceNumber: i.invoiceId,
      customerEmail: i.customerEmail,
      amount: Math.round(i.amount * 100) / 100,
      currency: i.currency,
      paidOn: i.paidOn,
    },
  };
}

/** Hex HMAC-SHA256 of a message under a key. */
export function hmacSha256Hex(key: string, message: string): string {
  return createHmac("sha256", key).update(message, "utf8").digest("hex");
}

/** The signature for one send: HMAC-SHA256 of `${timestamp}.${rawBody}`, keyed with the shared secret. */
export function sign(timestamp: number, rawBody: string, secret: string): string {
  return hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
}

/**
 * Why an event must not be sent, or null when it can be. The reasons name the setting, never a value.
 * A business with no AutoLeads user saved is skipped and logged: the event would have no owner to land on.
 */
export function eventSkipReason(i: { ownerUid: string | null | undefined; url: string | undefined; secret: string | undefined }): string | null {
  if (!i.ownerUid || !i.ownerUid.trim()) return "No AutoLeads user is saved for this business, so the paid invoice was not sent.";
  if (!i.url || !i.url.trim()) return "AUTOLEADS_EVENTS_URL is not set on the server, so nothing was sent.";
  try {
    const u = new URL(i.url.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return "AUTOLEADS_EVENTS_URL is not a web address, so nothing was sent.";
  } catch {
    return "AUTOLEADS_EVENTS_URL is not a valid address, so nothing was sent.";
  }
  if (!i.secret || !i.secret.trim()) return "BALANCR_EVENT_SECRET is not set on the server, so nothing was sent.";
  return null;
}

export interface SendResult {
  sent: boolean;
  status: number | null;
  reason?: string;
}

/** POSTs one event, signed, with a 5 second timeout. Never throws: every failure comes back as { sent: false, reason }. */
export async function sendAutoLeadsEvent(
  event: AutoLeadsEvent,
  opts: { url: string; secret: string; now: number; fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<SendResult> {
  const body = JSON.stringify(event);
  const timestamp = opts.now;
  try {
    const doFetch = opts.fetchImpl ?? fetch;
    const res = await doFetch(opts.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Balancr-Timestamp": String(timestamp),
        "X-Balancr-Signature": sign(timestamp, body, opts.secret),
      },
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? AUTOLEADS_EVENT_TIMEOUT_MS),
    });
    if (res.ok) return { sent: true, status: res.status };
    return { sent: false, status: res.status, reason: `AutoLeads answered ${res.status}, so the event was not accepted.` };
  } catch (err) {
    const timedOut = (err as { name?: string })?.name === "TimeoutError" || (err as { name?: string })?.name === "AbortError";
    return { sent: false, status: null, reason: timedOut ? "AutoLeads did not answer within 5 seconds." : "Couldn't reach AutoLeads." };
  }
}
