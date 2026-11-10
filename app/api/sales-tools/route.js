// app/api/sales-tools/route.js - the pricing check and the agreement draft, from the owner's inputs only. Signed-in owner; nothing is sent.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { priceQuote } from '../../../lib/pricing.js';
import { agreementDraft } from '../../../lib/agreement.js';

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const g = await guardTenant(getDb(), who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  if (body?.action === 'price') return NextResponse.json(priceQuote(body), { status: 200, headers: NO_STORE });
  if (body?.action === 'agreement') {
    const r = agreementDraft({ kind: body.kind, seller: body.seller, buyer: body.buyer, date: body.date, value: body.value === '' ? null : Number(body.value), scope: body.scope });
    return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: NO_STORE });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400, headers: NO_STORE });
}
