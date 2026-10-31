// app/api/invoices/create/route.js - creates an invoice from the Billing page. Gets the next number unless one was typed.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { addDoc, collection, doc, getDoc } from '../../../../lib/server-firestore.js';
import { buildInvoiceWrite } from '../../../../lib/billing.js';
import { nextInvoiceNumber } from '../../../../lib/server/invoice-number.js';

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
  const taxRate = Number(biz.exists() ? biz.data().taxRate : 0) || 0;
  const r = buildInvoiceWrite({
    uid, email: body?.email, businessName: body?.businessName, amount: body?.amount, number: body?.number, note: body?.note,
    issuedAt: body?.issuedAt || undefined, termsDays: body?.termsDays !== '' && body?.termsDays !== undefined ? body.termsDays : undefined, taxRate,
  });
  if (!r.ok) return json({ error: r.error }, 400);
  try {
    if (!r.write.number) r.write.number = await nextInvoiceNumber(db, uid);
    const ref = await addDoc(collection(db, 'invoices'), r.write);
    return json({ ok: true, id: ref.id, number: r.write.number, dueAt: r.write.dueAt });
  } catch (e) {
    console.error('[invoices/create] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not save the invoice. Try again.' }, 500);
  }
}
