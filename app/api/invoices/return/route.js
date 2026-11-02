// app/api/invoices/return/route.js - the owner records a return on a PAID (or part-paid) storefront order: which lines come back,
// whether each goes back into stock, a refund or store credit, and an optional restocking fee. Stock and the record are written in
// one transaction. Store credit becomes a held credit note for the customer's next invoice. The app moves no money: a refund is
// recorded as owed, and the owner pays it back by their own means.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { addDoc, collection, doc, getDoc } from '../../../../lib/server-firestore.js';
import { runTx } from '../../../../lib/server/tx.js';
import { addStockInTx } from '../../../../lib/server/stock-hold.js';
import { planReturn } from '../../../../lib/returns.js';
import { CREDIT_STATUS } from '../../../../lib/credit-notes.js';
import { nextCreditNumber } from '../../../../lib/server/credit-number.js';

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

  const id = String(body?.id || '').slice(0, 80);
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return json({ error: 'Choose the order.' }, 400);
  const lines = Array.isArray(body?.lines) ? body.lines.slice(0, 40).map((l) => ({
    productId: String(l?.productId || '').slice(0, 80), variantId: String(l?.variantId || '').slice(0, 40),
    // Orders placed before Pass 119 have no product link: the line is named by its position, and the owner names the product to restock.
    lineIndex: Number.isInteger(l?.lineIndex) ? l.lineIndex : null,
    restockProductId: String(l?.restockProductId || '').slice(0, 80), restockVariantId: String(l?.restockVariantId || '').slice(0, 40),
    quantity: Number(l?.quantity), restock: l?.restock === true,
  })) : [];
  const method = body?.method === 'store_credit' ? 'store_credit' : 'refund';
  const restockFeePct = Number(body?.restockFeePct) || 0;
  const note = String(body?.note || '');

  try {
    const result = await runTx(db, async (tx) => {
      const ref = doc(db, 'invoices', id);
      const s = await tx.get(ref);
      if (!s.exists() || s.data().userId !== uid) return { error: 'This order could not be found.', status: 404 };
      const inv = s.data();
      if (inv.source !== 'storefront') return { error: 'Only orders placed on your public page are returned here.', status: 409 };
      if (!(Number(inv.amountPaid) > 0)) return { error: 'Nothing has been paid on this order, so there is nothing to return. Cancel it instead.', status: 409 };
      const plan = planReturn({ invoice: { id, ...inv }, lines, method, restockFeePct, note });
      if (!plan.ok) return { error: plan.error, status: 400 };
      // Stock goes back only for products that track it (a product with no stock count is left alone).
      // If the hold on this order lapsed (unpaid for two days), its stock was already put back, so a return must not add it again.
      const restockAllowed = !inv.holdReleasedAt;
      if (restockAllowed) await addStockInTx(tx, db, uid, plan.stockBack);
      const owed = Math.round(((Number(inv.returnRefundDue) || 0) + (plan.record.method === 'refund' ? plan.refund : 0)) * 100) / 100;
      tx.update(ref, { returns: [...(Array.isArray(inv.returns) ? inv.returns : []), plan.record], returnRefundDue: owed });
      return { plan, restockAllowed, currency: inv.currency || '', email: inv.email, name: inv.businessName, number: inv.number };
    });
    if (result.error) return json({ error: result.error }, result.status || 409);

    // Store credit is a held credit note for this customer, applied automatically to their next invoice.
    let creditNumber = '';
    if (result.plan.record.method === 'store_credit') {
      const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
      const currency = result.currency || String((biz.exists() ? biz.data() : {}).currency || '');
      creditNumber = await nextCreditNumber(db, uid);
      const now = new Date().toISOString();
      await addDoc(collection(db, 'credit_notes'), {
        userId: uid, number: creditNumber, quoteId: '', invoiceId: id, source: 'return',
        customerEmail: String(result.email || '').trim().toLowerCase(), customerName: String(result.name || '').slice(0, 200),
        currency: String(currency).slice(0, 8), amount: result.plan.refund,
        reason: `Return on order ${result.number || ''}`.slice(0, 200), status: CREDIT_STATUS.HELD,
        issuedAt: now, statusAt: now,
      });
    }
    return json({
      ok: true, refund: result.plan.refund, method: result.plan.record.method, restockFee: result.plan.record.restockFee,
      stockReturned: result.restockAllowed ? result.plan.stockBack.length : 0,
      stockNote: !result.restockAllowed
        ? 'The stock on this order was already put back when its hold lapsed, so no stock was added again.'
        : (result.plan.restockSkipped ? `${result.plan.restockSkipped} line${result.plan.restockSkipped === 1 ? '' : 's'} on this older order had no product named, so no stock was put back for ${result.plan.restockSkipped === 1 ? 'it' : 'them'}.` : ''),
      creditNumber,
    });
  } catch (e) {
    console.error('[invoices/return] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not record the return. Try again.' }, 500);
  }
}
