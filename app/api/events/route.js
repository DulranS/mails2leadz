// app/api/events/route.js - create an event and list the owner's events. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { collection, getDocs, query, where, limit } from '../../../lib/server-firestore.js';
import { createEvent } from '../../../lib/server/events.js';
import { rsvpStatus } from '../../../lib/events.js';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const evs = (await getDocs(query(collection(db, 'public_events'), where('userId', '==', who.uid), limit(50)))).docs;
  const out = [];
  for (const d of evs) {
    const rsvps = (await getDocs(query(collection(db, 'public_events', d.id, 'rsvps'), limit(600)))).docs.map((x) => x.data());
    out.push({ token: d.id, ...d.data(), ...rsvpStatus(d.data(), rsvps), consented: rsvps.filter((r) => r.marketingConsent).length });
  }
  return NextResponse.json({ events: out }, { headers: NO_STORE });
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  const r = await createEvent(db, who.uid, body);
  return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: NO_STORE });
}
