// app/api/balancr/sync/route.js - the owner's own actions: send a deal to Balancr, pull Balancr's new leads, or check one invoice. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { pushDeal, pullLeads, syncInvoice } from '../../../../lib/server/balancr.js';

const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: NO_STORE });

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  if (body?.action === 'push') { const r = await pushDeal(db, who.uid, String(body.dealId || '')); return json(r, r.ok ? 200 : 400); }
  if (body?.action === 'pull') { const r = await pullLeads(db, who.uid); return json(r, r.ok ? 200 : 400); }
  if (body?.action === 'invoice') { const r = await syncInvoice(db, who.uid, String(body.invoiceId || ''), String(body.balancrKey || '')); return json(r, r.ok ? 200 : 400); }
  return json({ error: 'Unknown action.' }, 400);
}
