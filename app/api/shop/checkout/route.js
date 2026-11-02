// app/api/shop/checkout/route.js - PUBLIC (listed in proxy.js). A customer orders from the public page: the basket becomes one
// invoice (with any held credit applied), stock is held for it, and when card payment is set up a pay link is returned.
// Prices, delivery charge and stock all come from the server, never from the browser. An order is an invoice; it is not a deal.
import { NextResponse } from 'next/server';
import { chargeTerms } from '../../../../lib/currency.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { isAdminMode, doc, getDoc } from '../../../../lib/server-firestore.js';
import { ownerFromKey } from '../../../../lib/server/owner-key.js';
import { makeLimiter } from '../../../../lib/rate-limit.js';
import { sanitizeBasket, priceBasket } from '../../../../lib/shop.js';
import { planStockHold, weightOf } from '../../../../lib/products.js';
import { sanitizePostage, quotePostage } from '../../../../lib/postage.js';
import { sanitizeTaxRates, rateForCountry } from '../../../../lib/tax-rates.js';
import { releaseStock } from '../../../../lib/server/stock-hold.js';
import { runTx } from '../../../../lib/server/tx.js';
import { buildInvoiceWrite, DEFAULT_PAYMENT_TERMS_DAYS } from '../../../../lib/billing.js';
import { addInvoiceWithCredit } from '../../../../lib/server/credit-apply.js';
import { nextInvoiceNumber } from '../../../../lib/server/invoice-number.js';
import { paymentsReady, payLinkFor } from '../../../../lib/server/payments.js';
import { secretsFor, PAYMENT_NAMES } from '../../../../lib/server/integration-secrets.js';
import { stopColdFollowUps } from '../../../../lib/server/inbound-stop.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
// A customer may place a few orders in a quarter of an hour from one address; more than that is a loop or an attack.
const limiter = makeLimiter({ limit: 10, windowMs: 900000 });

export async function POST(request) {
  if (!isAdminMode()) return json({ error: 'Ordering is not available.' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const db = getDb();
  const uid = await ownerFromKey(db, body?.k);
  if (!uid) return json({ error: 'This page is not available.' }, 404);
  const basket = sanitizeBasket(body);
  if (basket.bot) return json({ ok: true, payLink: '', warning: '' }); // filled honeypot: same kind of answer, nothing recorded
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(basket.email)) return json({ error: 'Enter your email address.' }, 400);
  if (!basket.items.length) return json({ error: 'Add at least one item.' }, 400);
  if (basket.delivery === 'ship' && basket.shipTo.length < 8) return json({ error: 'Enter the address to post the order to.' }, 400);
  if (!limiter.hit(`${uid}:${basket.email}`).ok) return json({ error: 'Too many orders from this address. Try again later.' }, 429);
  try {
    const productsById = {};
    for (const it of basket.items) {
      const snap = await getDoc(doc(db, 'users', uid, 'products', it.productId));
      if (snap.exists() && !snap.data().archived) productsById[it.productId] = snap.data(); // an archived product is no longer on sale
    }
    const priced = priceBasket(basket.items, productsById);
    if (!priced.ok) return json({ error: priced.error }, 400);
    const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
    const bs = biz.exists() ? biz.data() : {};
    const site = await getDoc(doc(db, 'users', uid, 'settings', 'site'));
    const siteData = site.exists() ? site.data() : {};
    // Postage: weight bands by destination when the owner set them; otherwise one flat charge. Refused, never guessed.
    const bands = sanitizePostage(siteData.postageRules);
    let deliveryFee = 0;
    let postageBand = '';
    if (basket.delivery === 'ship') {
      const unweighed = bands.length
        ? basket.items.filter((it) => productsById[it.productId] && weightOf(productsById[it.productId], it.variantId) === null).map((it) => String(productsById[it.productId].name || 'an item').slice(0, 80))
        : [];
      // Postage weight: each option's own weight when it has one, otherwise the product's.
      const weightKg = Math.round(basket.items.reduce((sum, it) => sum + (Number(weightOf(productsById[it.productId], it.variantId)) || 0) * it.quantity, 0) * 1000) / 1000;
      const quote = quotePostage({ bands, flatFee: Number(siteData.shippingFee) || 0, weightKg, country: basket.country, unweighed });
      if (!quote.ok) return json({ error: quote.error }, 400);
      deliveryFee = quote.fee;
      postageBand = quote.band;
    }

    // Stock is read and taken in one transaction, so two buyers cannot both take the last unit.
    const stock = await runTx(db, async (tx) => {
      const lines = [];
      for (const it of basket.items) {
        const snap = await tx.get(doc(db, 'users', uid, 'products', it.productId));
        lines.push({ productId: it.productId, variantId: it.variantId || '', quantity: it.quantity, product: snap.exists() && !snap.data().archived ? snap.data() : null });
      }
      const plan = planStockHold(lines);
      if (!plan.ok) return plan;
      // The new counts: per option for a product with options (every option is written, so none is lost), otherwise the one count.
      const byProduct = new Map();
      for (const h of plan.holds) if (h.tracked) byProduct.set(h.productId, [...(byProduct.get(h.productId) || []), h]);
      for (const [pid, holds] of byProduct) {
        const product = lines.find((l) => l.productId === pid).product;
        const ref = doc(db, 'users', uid, 'products', pid);
        if (Array.isArray(product.variants) && product.variants.length) {
          const variants = product.variants.map((v) => {
            const h = holds.find((x) => x.variantId === v.id);
            return h ? { ...v, stockOnHand: h.after } : v;
          });
          tx.update(ref, { variants });
        } else {
          tx.update(ref, { stockOnHand: holds[0].after });
        }
      }
      return plan;
    });
    if (!stock.ok) return json({ error: stock.error }, 409);

    // The tax rate follows the customer's country when the owner has entered one for it; otherwise the business default.
    const businessRate = Number(bs.taxRate) > 0 ? Number(bs.taxRate) : 0;
    const taxRate = basket.delivery === 'ship' ? rateForCountry(sanitizeTaxRates(siteData.taxRates), basket.country, businessRate) : businessRate;
    const termsDays = Number.isFinite(Number(bs.paymentTermsDays)) ? Number(bs.paymentTermsDays) : DEFAULT_PAYMENT_TERMS_DAYS;
    const note = (priced.note + (deliveryFee ? '; delivery' : '')).slice(0, 200);
    // The customer may pay in a saved currency; the server takes the rate from the owner's saved rates, never from the page.
    const terms = chargeTerms(bs, body?.chargeCurrency);
    if (terms.error) { await releaseStock(db, uid, stock.holds); return json({ error: terms.error }, 400); }
    const built = buildInvoiceWrite({
      uid, email: basket.email, businessName: basket.name, amount: Math.round((priced.amount + deliveryFee) * 100) / 100,
      termsDays, taxRate, note, now: new Date(), chargeCurrency: terms.chargeCurrency, fxRate: terms.fxRate,
    });
    if (!built.ok) { await releaseStock(db, uid, stock.holds); return json({ error: built.error }, 400); }
    let ref;
    try {
      built.write.number = await nextInvoiceNumber(db, uid);
      built.write.source = 'storefront';
      built.write.basketLines = priced.lines.map((l) => ({ productId: l.productId, variantId: l.variantId || '', variantLabel: l.variantLabel || '', name: l.name, quantity: l.quantity, unit: l.unit, amount: l.amount }));
      built.write.stockHolds = stock.holds.map((h) => ({ productId: h.productId, variantId: h.variantId || '', quantity: h.quantity, tracked: h.tracked }));
      built.write.delivery = basket.delivery;
      built.write.deliveryFee = deliveryFee;
      built.write.shipTo = basket.delivery === 'ship' ? basket.shipTo : '';
      built.write.country = basket.delivery === 'ship' ? basket.country : '';
      built.write.postageBand = postageBand;
      ref = await addInvoiceWithCredit(db, uid, built.write);
    } catch (e) {
      await releaseStock(db, uid, stock.holds); // the order was not saved, so the stock it took goes back
      throw e;
    }
    // An order is a clear sign of interest: a sales follow-up must not arrive after it.
    await stopColdFollowUps(db, uid, basket.email, 'ordered online').catch(() => {});
    const cardReady = paymentsReady(await secretsFor(db, uid, PAYMENT_NAMES));
    const payLink = cardReady ? (payLinkFor(uid, ref.id) || '') : '';
    return json({
      ok: true, number: built.write.number, total: built.write.total, payLink,
      chargeCurrency: built.write.chargeCurrency || '', chargeTotal: built.write.chargeTotal ?? null,
      warning: payLink ? '' : 'Card payment is not set up yet, so the business will send you the invoice.',
    });
  } catch (e) {
    console.error('[shop/checkout] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not place the order. Try again.' }, 500);
  }
}
