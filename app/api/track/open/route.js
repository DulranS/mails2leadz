// app/api/track/open/route.js - PUBLIC (listed in proxy.js). The tracking image in an email: an invoice, a quote, or an outbound email.
// Records the first open and a count on the right record. Always returns the same image.
import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/server/route-helpers.js';
import { doc, getDoc, updateDoc } from '../../../../lib/server-firestore.js';
import { verifyBookingToken } from '../../../../lib/server/booking-manage.js';

// a 1x1 transparent GIF
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function GET(request) {
  const token = request.nextUrl.searchParams.get('t');
  const target = [
    ['open-invoice', (w) => doc(getDb(), 'invoices', w.id)],
    ['open', (w) => doc(getDb(), 'users', w.uid, 'quotes', w.id)],
    ['open-email', (w) => doc(getDb(), 'sent_emails', w.id)],
  ];
  for (const [kind, refFor] of target) {
    const who = verifyBookingToken(kind, token);
    if (!who) continue;
    try {
      const ref = refFor(who);
      const snap = await getDoc(ref);
      if (snap.exists() && (kind === 'open-invoice' || kind === 'open' || snap.data().userId === who.uid)) {
        const now = new Date().toISOString();
        const d = snap.data();
        if (kind === 'open-email') await updateDoc(ref, { opened: true, openedCount: (Number(d.openedCount) || 0) + 1, lastOpenedAt: now });
        else await updateDoc(ref, { openedAt: d.openedAt || now, openCount: (Number(d.openCount) || 0) + 1, lastOpenedAt: now });
      }
    } catch (e) { console.error('[track open] failed:', String(e?.message || '').slice(0, 120)); }
    break;
  }
  return new NextResponse(GIF, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' } });
}
