// app/api/invoices/create/route.js - creates an invoice from the Billing page. Gets the next number unless one was typed.
// Optional product lines take those products off the shelf in one transaction, so the stock sold is counted. Stock is refused,
// not guessed, when there is not enough. If the invoice cannot be saved, the stock taken is put back.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { doc, getDoc } from '../../../../lib/server-firestore.js';
import { buildInvoiceWrite } from '../../../../lib/billing.js';
import { redeemPoints } from '../../../../lib/loyalty.js';
import { balanceFor, spendPoints } from '../../../../lib/server/loyalty.js';
import { normalizeCurrency, sanitizeFxDisplay } from '../../../../lib/currency.js';
import { addInvoiceWithCredit } from '../../../../lib/server/credit-apply.js';
import { nextInvoiceNumber } from '../../../../lib/server/invoice-number.js';
import { runTx } from '../../../../lib/server/tx.js';
import { releaseStock } from '../../../../lib/server/stock-hold.js';
import { planStockHold } from '../../../../lib/products.js';
import { sanitizeStockLines } from '../../../../lib/manual-stock.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;
  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;
  const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
  const bizData = biz.exists() ? biz.data() : {};
  const taxRate = Number(bizData.taxRate) || 0;
  // Charge in another currency only at a rate the owner saved on Account (the browser's rate is never trusted).
  const baseCur = normalizeCurrency(bizData.currency);
  const wanted = String(body?.chargeCurrency || '').trim().toUpperCase();
  let chargeCurrency = '';
  let fxRate = 0;
  if (wanted && wanted !== baseCur) {
    const hit = sanitizeFxDisplay(bizData.fxDisplay, baseCur).find((x) => x.code === wanted);
    if (!hit) return json({ error: `Add a rate for ${wanted} on the Account page first.` }, 400);
    chargeCurrency = hit.code;
    fxRate = hit.rate;
  }
  // Loyalty points: checked first, taken off only after the invoice is saved (see below).
  const redeemPts = Number(body?.redeemPoints) || 0;
  let loyaltyAmount = body?.amount;
  let loyaltyUse = null;
  if (redeemPts > 0) {
    loyaltyUse = redeemPoints({ balance: await balanceFor(db, uid, body?.email), points: redeemPts, amount: Number(body?.amount) });
    if (!loyaltyUse.ok) return json({ error: loyaltyUse.error }, 400);
    loyaltyAmount = loyaltyUse.amount;
  }
  const r = buildInvoiceWrite({
    uid, email: body?.email, businessName: body?.businessName, amount: loyaltyAmount, number: body?.number, note: body?.note,
    issuedAt: body?.issuedAt || undefined, termsDays: body?.termsDays !== '' && body?.termsDays !== undefined ? body.termsDays : undefined, taxRate,
    chargeCurrency, fxRate,
  });
  if (!r.ok) return json({ error: r.error }, 400);
  const stockReq = sanitizeStockLines(body?.stockLines);
  if (stockReq.error) return json({ error: stockReq.error }, 400);

  // Stock first, inside one transaction: the reads come before the writes, and a sale that the shelf cannot cover is refused.
  // Hand-made sales are not held back by the online safety buffer or the per-order limit: the owner is selling it in person.
  let taken = [];
  // One stock system: the catalog, taken when an invoice is paid. Product stock is no longer taken at invoice creation.
  const PRODUCT_STOCK_AT_INVOICE = false;
  if (PRODUCT_STOCK_AT_INVOICE && stockReq.lines.length) {
    const outcome = await runTx(db, async (tx) => {
      const lines = [];
      for (const l of stockReq.lines) {
        const snap = await tx.get(doc(db, 'users', uid, 'products', l.productId));
        const p = snap.exists() && !snap.data().archived ? snap.data() : null;
        const product = p ? { ...p, maxPerOrder: null, holdBack: 0, variants: (Array.isArray(p.variants) ? p.variants : []).map((v) => ({ ...v, holdBack: 0 })) } : null;
        lines.push({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, product });
      }
      const plan = planStockHold(lines);
      if (!plan.ok) return plan;
      const byProduct = new Map();
      for (const h of plan.holds) if (h.tracked) byProduct.set(h.productId, [...(byProduct.get(h.productId) || []), h]);
      for (const [pid, hs] of byProduct) {
        const product = lines.find((l) => l.productId === pid).product;
        const ref = doc(db, 'users', uid, 'products', pid);
        if (Array.isArray(product.variants) && product.variants.length) {
          tx.update(ref, { variants: product.variants.map((v) => { const h = hs.find((x) => x.variantId === v.id); return h ? { ...v, stockOnHand: h.after } : v; }) });
        } else {
          tx.update(ref, { stockOnHand: hs[0].after });
        }
      }
      return plan;
    });
    if (!outcome.ok) return json({ error: outcome.error }, 409);
    taken = outcome.holds;
  }

  try {
    if (!r.write.number) r.write.number = await nextInvoiceNumber(db, uid);
    r.write.manualStockTaken = taken.filter((h) => h.tracked).map((h) => ({ productId: h.productId, variantId: h.variantId || '', quantity: h.quantity, tracked: true }));
    r.write.saleLines = String(body?.saleLines || '').slice(0, 300);
    const ref = await addInvoiceWithCredit(db, uid, r.write);
    if (loyaltyUse?.ok) await spendPoints(db, uid, body?.email, loyaltyUse.pointsUsed).catch(() => ({}));
    return json({ ok: true, id: ref.id, number: r.write.number, dueAt: r.write.dueAt, stockTaken: taken.filter((h) => h.tracked).length });
  } catch (e) {
    await releaseStock(db, uid, taken).catch(() => ({})); // the invoice was not saved, so the stock it took goes back
    console.error('[invoices/create] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not save the invoice. Try again.' }, 500);
  }
}
