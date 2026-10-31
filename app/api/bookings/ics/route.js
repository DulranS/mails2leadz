// app/api/bookings/ics/route.js - PUBLIC (listed in proxy.js). The owner's calendar feed: confirmed bookings, as an iCalendar file.
// Google, Outlook and Apple calendars subscribe to this address and keep it up to date. The signed link names the account.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { isAdminMode, collection, getDoc, getDocs, limit, query, where, doc } from '../../../../lib/server-firestore.js';
import { verifyBookingToken } from '../../../../lib/server/booking-manage.js';
import { icsFor } from '../../../../lib/booking.js';

export async function GET(request) {
  if (!isAdminMode()) return new NextResponse('Not available.', { status: 503 });
  const who = verifyBookingToken('feed', request.nextUrl.searchParams.get('t'));
  if (!who) return new NextResponse('This calendar link is not valid.', { status: 400 });
  const db = getDb();
  const rows = (await getDocs(query(collection(db, 'users', who.uid, 'bookings'), where('status', '==', 'confirmed'), limit(1000)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const biz = await getDoc(doc(db, 'users', who.uid, 'settings', 'business'));
  const body = icsFor({ bookings: rows, now: Date.now(), businessName: biz.exists() ? biz.data().businessName || 'Bookings' : 'Bookings' });
  return new NextResponse(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, no-store' } });
}
