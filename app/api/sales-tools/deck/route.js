// app/api/sales-tools/deck/route.js - the owner's pitch deck as printable HTML slides. Signed-in owner only; nothing is sent anywhere.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { economicsFor } from '../../../../lib/server/economics.js';
import { deckSlides, deckHtml } from '../../../../lib/deck.js';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const m = await economicsFor(db, who.uid).catch(() => ({}));
  const slides = deckSlides({ businessName: m.businessName, offer: m.offer, idealCustomer: m.idealCustomer, won: m.newCustomersLast12Months ?? null, pricePoint: m.pricePoint ?? null, averageContractValue: m.averageContractValue ?? null });
  return new NextResponse(deckHtml(slides, m.businessName ? `${m.businessName} pitch deck` : 'Pitch deck'), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': 'inline; filename="pitch-deck.html"', ...NO_STORE },
  });
}
