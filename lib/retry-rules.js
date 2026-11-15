// lib/retry-rules.js - automatic invoice emails that did not go out (spec 7.4). Pure.
// Before this, a failed invoice email was never tried again: the planners skip customers already invoiced.
// Now a failed send is tried again on later daily runs, a day apart, up to RETRY_MAX_ATTEMPTS times. After that it stops
// and shows on Today, so the owner can send it by hand. An invoice the send window closed on is queued the same way.
export const RETRY_MAX_ATTEMPTS = 3;
export const RETRY_GAP_MS = 24 * 60 * 60 * 1000;
export const RETRY_PER_RUN_MAX = 20;
const clip = (v, n) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** Fields to store on an invoice after an automatic send did not go out. `prev` is the invoice as stored. */
export function afterFailedSend(prev = {}, why = 'send_failed', now = Date.now()) {
  const attempts = Math.max(0, Math.floor(Number(prev?.sendAttempts) || 0)) + 1;
  const gaveUp = attempts >= RETRY_MAX_ATTEMPTS;
  return {
    sendAttempts: attempts,
    sendFailedAt: new Date(now).toISOString(),
    sendFailedWhy: clip(why, 40) || 'send_failed',
    sendStatus: gaveUp ? 'gave_up' : 'retrying',
    nextSendAt: gaveUp ? null : new Date(now + RETRY_GAP_MS).toISOString(),
  };
}

/** Fields for an invoice the send window was closed on: it goes out on the first run the window is open. */
export function queuedForSend(now = Date.now()) {
  return { sendAttempts: 0, sendStatus: 'retrying', nextSendAt: new Date(now).toISOString() };
}

/** True when a stored invoice should be emailed on this run. Manual invoices are never queued, so they are never sent by this.
 *  The stored invoice must carry an id (the job reads it from its collection). */
export function isRetryDue(inv = {}, now = Date.now()) {
  if (!inv || !inv.id || !inv.email) return false;
  if (inv.emailedAt || inv.heldReason) return false;
  if (inv.status === 'paid' || inv.status === 'void') return false;
  if (inv.sendStatus !== 'retrying') return false;
  if ((Number(inv.sendAttempts) || 0) >= RETRY_MAX_ATTEMPTS) return false;
  const next = Date.parse(inv.nextSendAt || '');
  return !Number.isFinite(next) || next <= now;
}

/** The invoices to email on this run: oldest first, capped so one run cannot send a flood. */
export function dueRetries(invoices = [], now = Date.now(), max = RETRY_PER_RUN_MAX) {
  const at = (x) => Date.parse(x.sendFailedAt || x.issuedAt || '') || 0;
  return (Array.isArray(invoices) ? invoices : [])
    .filter((i) => isRetryDue(i, now))
    .sort((a, b) => at(a) - at(b))
    .slice(0, max);
}

/** Invoices an automatic send has not delivered: still being tried, or given up. Counted on Today. */
export function unsentInvoiceCount(invoices = []) {
  return (Array.isArray(invoices) ? invoices : []).filter((i) => i
    && !i.emailedAt && !i.heldReason
    && i.status !== 'paid' && i.status !== 'void'
    && (i.sendStatus === 'retrying' || i.sendStatus === 'gave_up')).length;
}
