// app/api/stock/payment/route.js - takes stock once for a paid invoice. Runs once per invoice: a second call changes nothing. Signed-in owner only.
import { NextResponse } from 'next/server';
import { collection, doc, getDoc, setDoc } from '../../../../lib/server-firestore.js';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { loadCatalog } from '../../../../lib/server/catalog.js';
import { drawStock, parseSaleLines } from '../../../../lib/stock-draw.js';

const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: NO_STORE });

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  const invRef = doc(db, 'users', who.uid, 'invoices', String(body?.invoiceId || ''));
  const inv = (await getDoc(invRef).catch(() => null))?.data?.();
  if (!inv) return json({ error: 'That invoice was not found.' }, 404);
  if (inv.stockDrawnAt) return json({ ok: true, alreadyDone: true, drawn: [], shortfalls: [] });
  if (inv.status !== 'paid' && body?.assumePaid !== true) return json({ error: 'Stock is taken once the invoice is paid.' }, 400);
  const lines = Array.isArray(inv.saleItems) ? inv.saleItems : parseSaleLines(body?.saleLines || inv.saleLines || '');
  if (!lines.length) return json({ ok: true, drawn: [], shortfalls: [], note: 'This invoice has no items to take stock for.' });
  const catalog = await loadCatalog(db, who.uid);
  const r = drawStock(catalog, lines);
  await setDoc(doc(db, 'users', who.uid, 'settings', 'business'), { catalog: r.items }, { merge: true });
  await setDoc(invRef, { stockDrawnAt: new Date().toISOString() }, { merge: true });
  return json({ ok: true, drawn: r.drawn, shortfalls: r.shortfalls });
}
