// app/api/bookings/route.js - the owner's bookings, newest first.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { collection, getDocs, limit, query } from '../../../lib/server-firestore.js';
import { signBookingToken } from '../../../lib/server/booking-manage.js';

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  try {
    const snap = await getDocs(query(collection(getDb(), 'users', who.uid, 'bookings'), limit(500)));
    const base = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
    const items = snap.docs.map((d) => {
      const t = signBookingToken('manage', who.uid, d.id);
      return { id: d.id, ...d.data(), manageLink: /^https:\/\//i.test(base) && t ? `${base}/manage?t=${encodeURIComponent(t)}` : '' };
    }).sort((a, b) => String(a.startIso).localeCompare(String(b.startIso)));
    return NextResponse.json({ items }, { headers: NO_STORE });
  } catch (e) {
    console.error('[bookings] read failed:', e.message);
    return NextResponse.json({ error: 'Could not read the bookings. Try again.' }, { status: 500, headers: NO_STORE });
  }
}
