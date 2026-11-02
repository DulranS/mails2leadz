// lib/returns.js - a return of some lines of a paid storefront order (pure). The app records the return, puts stock back where the
// owner says it can be sold again, and records what is owed back. It moves no money.
// Refund = returned lines at the price paid, scaled to include the tax on the order, less an optional restocking fee.
// A refund can never exceed what the customer paid, and no line can be returned more than once in total.
// Lines of orders placed before Pass 119 carry no product link: they are matched by their position on the order, and the owner
// names the product whose stock goes back (or none).
export const RESTOCK_FEE_MAX_PCT = 50;

const cents = (n) => Math.round(Number(n) * 100) / 100;

/** The key of an order line: its product and option when it has a product link, otherwise its position on the order. */
export function lineKeyOf(line = {}, index = 0) {
  if (line.productId) return `${line.productId}|${line.variantId || ''}`;
  return `line:${Number.isInteger(line.lineIndex) ? line.lineIndex : index}`;
}

/** Finds the order line a return line refers to. Linked lines by product and option; unlinked lines by position. -1 when none. */
function findLine(bought, w) {
  if (Number.isInteger(w.lineIndex) && bought[w.lineIndex] && !bought[w.lineIndex].productId) return w.lineIndex;
  if (w.productId) return bought.findIndex((x) => x.productId === w.productId && String(x.variantId || '') === String(w.variantId || ''));
  return -1;
}

/**
 * @param invoice         the storefront invoice: basketLines [{productId,variantId,name,quantity,unit,amount}], amount, total, amountPaid, returns []
 * @param lines           [{productId, variantId, lineIndex, quantity, restock, restockProductId, restockVariantId}] what comes back
 * @param method          'refund' (money owed back) or 'store_credit' (credit held for the customer's next invoice)
 * @param restockFeePct   0 to 50: a fee kept on the refund for handling
 * @returns {{ok:true, record:object, refund:number, stockBack:object[], restockSkipped:number} | {ok:false, error:string}}
 */
export function planReturn({ invoice = {}, lines = [], method = 'refund', restockFeePct = 0, note = '', now = new Date() } = {}) {
  const bought = Array.isArray(invoice.basketLines) ? invoice.basketLines : [];
  if (!bought.length) return { ok: false, error: 'This order has no line items to return.' };
  if (!['refund', 'store_credit'].includes(method)) return { ok: false, error: 'Choose a refund or store credit.' };
  const pct = Math.round((Number(restockFeePct) || 0) * 100) / 100;
  if (pct < 0 || pct > RESTOCK_FEE_MAX_PCT) return { ok: false, error: `The restocking fee must be from 0 to ${RESTOCK_FEE_MAX_PCT}%.` };
  const wanted = (Array.isArray(lines) ? lines : []).filter((l) => l && Number(l.quantity) > 0);
  if (!wanted.length) return { ok: false, error: 'Choose at least one line and a quantity to return.' };

  // What has already come back, per line, so no line is returned twice.
  const prior = Array.isArray(invoice.returns) ? invoice.returns : [];
  const returnedSoFar = {};
  let refundedSoFar = 0;
  for (const r of prior) {
    refundedSoFar = cents(refundedSoFar + (Number(r.refund) || 0));
    for (const l of r.lines || []) {
      const k = lineKeyOf(l);
      returnedSoFar[k] = (returnedSoFar[k] || 0) + (Number(l.quantity) || 0);
    }
  }

  const outLines = [];
  const stockBack = [];
  let restockSkipped = 0;
  let net = 0;
  for (const w of wanted) {
    const idx = findLine(bought, w);
    if (idx < 0) return { ok: false, error: 'One of the lines is not on this order.' };
    const b = bought[idx];
    const qty = Math.floor(Number(w.quantity));
    const k = lineKeyOf(b, idx);
    const left = (Number(b.quantity) || 0) - (returnedSoFar[k] || 0);
    const label = [String(b.name || 'this item').slice(0, 80), b.variantLabel ? `(${String(b.variantLabel).slice(0, 60)})` : ''].filter(Boolean).join(' ');
    if (!(qty >= 1) || qty > left) return { ok: false, error: `Only ${Math.max(0, left)} of ${label} can still be returned.` };
    const unit = Number(b.unit) || 0;
    net = cents(net + unit * qty);
    const linked = !!b.productId;
    const restock = w.restock === true;
    // Stock goes back to the product on a linked line, or to the product the owner names for an older line.
    const restockProductId = linked ? String(b.productId) : String(w.restockProductId || '').slice(0, 80);
    const restockVariantId = linked ? String(b.variantId || '') : String(w.restockVariantId || '').slice(0, 40);
    outLines.push({
      productId: linked ? String(b.productId) : '', variantId: linked ? String(b.variantId || '') : '', lineIndex: idx,
      name: String(b.name || '').slice(0, 80), variantLabel: String(b.variantLabel || '').slice(0, 60),
      quantity: qty, unit: cents(unit), restock, restockProductId: restock ? restockProductId : '', restockVariantId: restock ? restockVariantId : '',
    });
    if (restock) {
      if (restockProductId) stockBack.push({ productId: restockProductId, variantId: restockVariantId, quantity: qty, tracked: true });
      else restockSkipped++;
    }
  }

  // Scale to the gross the customer paid (tax included); a restocking fee comes off the refund.
  const paidAmount = Number(invoice.amount) || 0;
  const paidGross = Number(invoice.total) || paidAmount;
  const ratio = paidAmount > 0 ? paidGross / paidAmount : 1;
  const gross = cents(net * ratio);
  const fee = cents(gross * pct / 100);
  const refund = cents(gross - fee);
  const ceiling = cents((Number(invoice.amountPaid) || paidGross) - refundedSoFar);
  if (refund <= 0) return { ok: false, error: 'Nothing is owed back for that return.' };
  if (refund > ceiling) return { ok: false, error: `The refund cannot be more than ${ceiling.toFixed(2)}, what is left of the payment.` };

  const record = {
    at: now.toISOString(), lines: outLines, method, restockFeePct: pct, restockFee: fee,
    gross, refund, note: String(note || '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 200),
  };
  return { ok: true, record, refund, stockBack, restockSkipped };
}

/** How much of each line is still left to return, for the form. `key` is the same key planReturn uses. */
export function returnable(invoice = {}) {
  const prior = Array.isArray(invoice.returns) ? invoice.returns : [];
  const done = {};
  for (const r of prior) for (const l of r.lines || []) {
    const k = lineKeyOf(l);
    done[k] = (done[k] || 0) + (Number(l.quantity) || 0);
  }
  return (invoice.basketLines || []).map((b, i) => {
    const key = lineKeyOf(b, i);
    return {
      key, lineIndex: i, productId: b.productId || '', variantId: b.variantId || '', linked: !!b.productId,
      name: b.name, variantLabel: b.variantLabel || '', unit: b.unit,
      left: Math.max(0, (Number(b.quantity) || 0) - (done[key] || 0)),
    };
  });
}

/**
 * A card refund against one stored payment. Refunds only what the owner has recorded as owed, never more than that payment
 * still holds, and never across two payments in one go. Payments made before the reference was stored cannot be refunded here
 * unless the owner names the Stripe payment (see matchCardPayment).
 * @returns {{ok:true, intent:string, cents:number, index:number} | {ok:false, error:string}}
 */
export function planCardRefund({ invoice = {}, amount = null } = {}) {
  const owed = Math.round((Number(invoice.returnRefundDue) || 0) * 100);
  const want = amount === null || amount === undefined ? owed : Math.round(Number(amount) * 100);
  if (!(want > 0)) return { ok: false, error: 'Nothing is owed back to refund by card.' };
  if (want > owed) return { ok: false, error: 'That is more than the refund owed on this order.' };
  const payments = Array.isArray(invoice.onlinePaymentIntents) ? invoice.onlinePaymentIntents : [];
  if (!payments.length) return { ok: false, error: 'This payment was made before card references were saved. Enter its Stripe payment ID to refund it by card, or refund it on Stripe.' };
  // The books work in the business currency; a foreign-currency charge is refunded in its own currency at the fixed rate.
  const foreign = !!(invoice.chargeCurrency && Number(invoice.fxRate) > 0);
  const chargeCents = foreign ? Math.round(want * Number(invoice.fxRate)) : want;
  for (let i = 0; i < payments.length; i++) {
    const p = payments[i];
    const left = Math.round((Number(p.amount) || 0) * 100) - Math.round((Number(p.refunded) || 0) * 100);
    if (left >= want) return { ok: true, intent: String(p.intent), cents: want, chargeCents, index: i };
  }
  return { ok: false, error: 'No single card payment has enough left for that refund. Refund it in two steps, or on Stripe.' };
}

/**
 * Checks a Stripe payment the owner names for an older order (one made before card references were stored). It must have
 * succeeded, and it must belong to this order: either Stripe recorded this order's id on it, or its amount is exactly what this
 * order paid. Returns the payment entry to keep on the order.
 * @param intent  the Stripe PaymentIntent as Stripe returns it (amounts in cents)
 * @returns {{ok:true, entry:object} | {ok:false, error:string}}
 */
export function matchCardPayment({ invoice = {}, invoiceId = '', intent = {} } = {}) {
  if (!intent || intent.status !== 'succeeded') return { ok: false, error: 'Stripe shows that payment did not succeed, so it cannot be refunded.' };
  const received = Math.round(Number(intent.amount_received) || 0);
  if (!(received > 0)) return { ok: false, error: 'That payment has no amount received.' };
  const tagged = intent.metadata && intent.metadata.invoiceId;
  if (tagged) {
    if (String(tagged) !== String(invoiceId)) return { ok: false, error: 'That Stripe payment belongs to another order.' };
  } else if (received !== Math.round((Number(invoice.amountPaid) || 0) * 100)) {
    return { ok: false, error: 'That payment does not match what this order paid, so it cannot be used for this order.' };
  }
  return { ok: true, entry: {
    intent: String(intent.id), amount: received / 100,
    refunded: Math.round(Number(intent.amount_refunded) || 0) / 100,
    at: new Date().toISOString(), adopted: true,
  } };
}
