// app/api/bookings/feed/route.js - the owner's calendar feed address, to paste into a calendar app as "subscribe by URL".
import { NextResponse } from 'next/server';
import { identify, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { signBookingToken } from '../../../../lib/server/booking-manage.js';

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  const base = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  const token = signBookingToken('feed', who.uid, 'calendar');
  const url = /^https:\/\//i.test(base) && token ? `${base}/api/bookings/ics?t=${encodeURIComponent(token)}` : null;
  return NextResponse.json({ url, note: url ? 'In your calendar app, subscribe to this address by URL.' : 'Set NEXT_PUBLIC_BASE_URL to your public https address first.' }, { headers: NO_STORE });
}
