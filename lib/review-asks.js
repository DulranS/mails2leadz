// lib/review-asks.js - one review request per storefront order, a week after its last parcel left (or after payment for a collected
// order). Pure: the daily run does the sending. Fixed wording; no incentive, no fake reviews. It is sent only when the owner has a
// review link, and never to a customer who has returned something from the order.
const DAY = 86400000;
export const REVIEW_ASK_AFTER_DAYS = 7;
export const REVIEW_ASK_WITHIN_DAYS = 60; // older orders are not chased, so turning this on does not email the whole history

const cleanLink = (v) => { const s = String(v || '').trim().slice(0, 300); return /^https:\/\/[^\s]+$/i.test(s) ? s : ''; };

/** Fixed wording: thanks, the review link, and an offer to put things right if the order was not right. */
export function reviewAskDraft({ number = '', name = '', reviewLink = '', senderName = '', business = '' } = {}) {
  const out = [name ? `Hello ${name},` : 'Hello,', ''];
  out.push(`Thank you for your order${number ? ` ${number}` : ''}${business ? ` from ${business}` : ''}.`, '');
  out.push('If you were happy with it, a short review helps other people find us:', reviewLink, '');
  out.push('If anything was not right, reply to this email and we will put it right.', '');
  if (senderName) out.push(senderName);
  return { subject: 'How was your order?', body: out.join('\n').replace(/\n+$/, '') };
}

/** @returns {{invoice, draft}[]} the orders to ask now, oldest first */
export function planReviewAsks({ invoices = [], now = Date.now(), reviewLink = '', senderName = '', business = '', max = 40 } = {}) {
  const link = cleanLink(reviewLink);
  if (!link) return [];
  const out = [];
  for (const inv of invoices) {
    if (!inv || inv.source !== 'storefront' || inv.status === 'void' || inv.reviewAskAt || !inv.email) continue;
    if (!(inv.status === 'paid' || Number(inv.amountPaid) > 0)) continue;
    if (Array.isArray(inv.returns) && inv.returns.length) continue;
    const shipped = (Array.isArray(inv.shipments) ? inv.shipments : []).map((p) => Date.parse(p?.shippedAt || '')).filter(Number.isFinite);
    const anchor = shipped.length ? Math.max(...shipped) : Date.parse(inv.paidAt || '');
    if (!Number.isFinite(anchor)) continue;
    const age = (now - anchor) / DAY;
    if (age < REVIEW_ASK_AFTER_DAYS || age > REVIEW_ASK_WITHIN_DAYS) continue;
    out.push({ invoice: inv, anchor, draft: reviewAskDraft({ number: inv.number, name: inv.businessName, reviewLink: link, senderName, business }) });
  }
  out.sort((a, b) => a.anchor - b.anchor);
  return out.slice(0, max);
}
