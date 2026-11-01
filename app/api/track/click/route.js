// app/api/track/click/route.js - PUBLIC (listed in proxy.js). A tracked link in an outbound email: records the click on its email,
// then sends the reader on to the address it was made for. Only addresses that were signed into the link are reachable.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { doc, getDoc, updateDoc } from '../../../../lib/server-firestore.js';
import { verifyClick } from '../../../../lib/server/open-track.js';

export async function GET(request) {
  const who = verifyClick(request.nextUrl.searchParams.get('t'));
  if (!who) return new NextResponse('This link is not valid.', { status: 400, headers: NO_STORE });
  try {
    const ref = doc(getDb(), 'sent_emails', who.id);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().userId === who.uid) {
      const now = new Date().toISOString();
      const d = snap.data();
      await updateDoc(ref, { clicked: true, clickCount: (Number(d.clickCount) || 0) + 1, lastClickedAt: now });
    }
  } catch (e) { console.error('[track click] failed:', String(e?.message || '').slice(0, 120)); }
  const res = NextResponse.redirect(who.url, 302);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
