// app/api/sales-tools/deck.pptx/route.js - the owner's pitch deck as a PowerPoint file. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { economicsFor } from '../../../../lib/server/economics.js';
import { deckSlides } from '../../../../lib/deck.js';
import { deckPptx } from '../../../../lib/pptx-deck.js';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const m = await economicsFor(db, who.uid).catch(() => ({}));
  const slides = deckSlides({ businessName: m.businessName, offer: m.offer, idealCustomer: m.idealCustomer, won: m.newCustomersLast12Months ?? null, pricePoint: m.pricePoint ?? null, averageContractValue: m.averageContractValue ?? null });
  const buf = await deckPptx(slides, m.businessName ? `${m.businessName} pitch deck` : 'Pitch deck');
  return new NextResponse(buf, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Content-Disposition': 'attachment; filename="pitch-deck.pptx"', ...NO_STORE } });
}
