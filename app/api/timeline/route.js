// app/api/timeline/route.js - one customer's history across emails, quotes, invoices, bookings and support. Read-only; viewers can read it.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { loadCustomerTimeline, loadDealHistory } from '../../../lib/server/customer-timeline.js';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,200}\.[^\s@]{2,}$/;

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  const email = String(new URL(request.url).searchParams.get('email') || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Enter the customer email exactly as it appears on their records.' }, { status: 400, headers: NO_STORE });
  }
  try {
    const [events, deal] = await Promise.all([loadCustomerTimeline(getDb(), who.uid, email), loadDealHistory(getDb(), who.uid, email)]);
    return NextResponse.json({ email, events, deal }, { headers: NO_STORE });
  } catch (e) {
    console.error('[timeline] read failed:', String(e?.message || '').slice(0, 120));
    return NextResponse.json({ error: 'Could not load this history. Try again.' }, { status: 500, headers: NO_STORE });
  }
}
