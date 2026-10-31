// lib/products.js - a small product catalogue, buying by payment link, and reorder reminders. Pure logic; the routes do the I/O.
const DAY_MS = 86400000;

export const PRODUCT_LIMITS = { name: 80, sku: 40, desc: 300, price: 1e7 };
export const REORDER_AFTER_DAYS = 60;

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** @returns {{product}|{error}} */
export function sanitizeProduct(raw) {
  const name = clean(raw?.name, PRODUCT_LIMITS.name);
  if (!name) return { error: 'Give the product a name.' };
  const price = Number(raw?.price);
  if (!Number.isFinite(price) || price <= 0 || price > PRODUCT_LIMITS.price) return { error: 'Enter a price above zero.' };
  return { product: { name, sku: clean(raw?.sku, PRODUCT_LIMITS.sku), description: clean(raw?.description, PRODUCT_LIMITS.desc), price: Math.round(price * 100) / 100 } };
}

/** The customers whose last paid purchase is at least `afterDays` old, and who have no unpaid invoice now. Most overdue first. */
export function reorderCandidates({ invoices = [], now = Date.now(), afterDays = REORDER_AFTER_DAYS } = {}) {
  const byEmail = new Map();
  const openEmails = new Set();
  for (const i of invoices) {
    const email = String(i?.email || '').toLowerCase();
    if (!email) continue;
    if (i.status === 'open' || i.status === 'partial' || i.status === 'overdue') openEmails.add(email);
    if (i.status !== 'paid') continue;
    const when = Date.parse(i.paidAt || i.issuedAt || '');
    if (!Number.isFinite(when)) continue;
    const prev = byEmail.get(email);
    if (!prev || when > prev.when) byEmail.set(email, { email, when, last: clean(i.note, 80), amount: Number(i.amount) || 0 });
  }
  return [...byEmail.values()]
    .filter((c) => !openEmails.has(c.email))
    .map((c) => ({ email: c.email, lastPaidAt: new Date(c.when).toISOString(), daysSince: Math.floor((now - c.when) / DAY_MS), lastPurchase: c.last, lastAmount: c.amount }))
    .filter((c) => c.daysSince >= afterDays)
    .sort((a, b) => b.daysSince - a.daysSince);
}

/** A friendly reorder note. Restates no price; offers to send the same product again. */
export function reorderDraft({ customer, lastPurchase, senderName = '' }) {
  const what = lastPurchase ? ` for ${lastPurchase}` : '';
  const text = [
    `Hello${customer ? ` ${customer}` : ''},`, '',
    `It has been a while since your last order${what}. If you need it again, reply to this email and I will send you a payment link.`,
    '', senderName || '',
  ].join('\n').replace(/\n+$/, '');
  return { subject: 'Ready to order again?', text };
}
