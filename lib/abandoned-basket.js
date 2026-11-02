// lib/abandoned-basket.js - the reminder for a saved basket that was never ordered (pure, no network).
// A customer asks for their basket to be emailed to them (basket-by-email). If they then do not order from that address within a
// day or so, one reminder is sent with a fresh link to the same basket. One reminder per basket, and never after an order.
export const REMINDER_AFTER_HOURS = 24;
export const REMINDER_WITHIN_HOURS = 72;

/** Baskets to remind about now: saved 24 to 72 hours ago, not yet reminded, no storefront order from that address since, and not
 *  itself a reminder. Oldest first. */
export function abandonedBaskets({ baskets = [], invoices = [], now = Date.now() } = {}) {
  const ordered = new Map(); // email -> latest storefront order time
  for (const i of invoices) {
    if (!i || i.source !== 'storefront' || !i.email) continue;
    const t = Date.parse(i.createdAt || '');
    if (!Number.isFinite(t)) continue;
    const e = String(i.email).toLowerCase();
    ordered.set(e, Math.max(ordered.get(e) || 0, t));
  }
  const out = [];
  for (const b of baskets) {
    if (!b || b.remindedAt || b.reminderOf || !b.storefrontKey || !b.email) continue;
    if (!Array.isArray(b.items) || !b.items.length) continue;
    const saved = Date.parse(b.createdAt || '');
    if (!Number.isFinite(saved)) continue;
    const hours = (now - saved) / 3600000;
    if (hours < REMINDER_AFTER_HOURS || hours > REMINDER_WITHIN_HOURS) continue;
    const email = String(b.email).toLowerCase();
    const lastOrder = ordered.get(email);
    if (lastOrder && lastOrder >= saved) continue; // they ordered after saving: nothing to remind about
    out.push({ ...b, email, saved });
  }
  return out.sort((a, b) => a.saved - b.saved);
}

/** Fixed wording: the basket is still there, how long it lasts, prices and stock are rechecked, and how to stop further messages. */
export function basketReminderDraft({ link, businessName = '', senderName = '' } = {}) {
  return {
    subject: 'Your basket is still saved',
    body: [
      'Hello,', '',
      `Your basket${businessName ? ` from ${businessName}` : ''} is still saved. Open it to pick up where you left off:`,
      link, '',
      'The link works for 7 days. Prices and stock are checked again when you place the order.', '',
      'If you have already ordered, or do not want this, reply and say so. We will not write about this basket again.', '',
      senderName || '',
    ].join('\n').replace(/\n+$/, ''),
  };
}
