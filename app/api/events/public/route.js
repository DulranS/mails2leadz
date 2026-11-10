// app/api/events/public/route.js - the public details of one event, by its link. Shows no guest names.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { doc, getDoc, getDocs, collection, limit, query } from '../../../../lib/server-firestore.js';
import { rsvpStatus } from '../../../../lib/events.js';

export async function GET(request) {
  const t = new URL(request.url).searchParams.get('t') || '';
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(t)) return NextResponse.json({ error: 'This event link is not valid.' }, { status: 404, headers: NO_STORE });
  const db = getDb();
  const ev = (await getDoc(doc(db, 'public_events', t)).catch(() => null))?.data?.();
  if (!ev) return NextResponse.json({ error: 'This event link is not valid.' }, { status: 404, headers: NO_STORE });
  const rsvps = (await getDocs(query(collection(db, 'public_events', t, 'rsvps'), limit(600)))).docs.map((d) => d.data());
  const st = rsvpStatus(ev, rsvps);
  return NextResponse.json({ title: ev.title, startsAt: ev.startsAt, place: ev.place, spotsLeft: st.spotsLeft, full: st.full }, { headers: NO_STORE });
}
