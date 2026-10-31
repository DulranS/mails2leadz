// app/api/inbound/messages/route.js - this account's SMS and WhatsApp replies, newest first (owner's own data).
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { collection, getDocs, limit, query, where } from '../../../../lib/server-firestore.js';

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  try {
    const snap = await getDocs(query(collection(getDb(), 'users', who.uid, 'inbound_messages'), limit(100)));
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)))
      .slice(0, 50)
      .map(({ id, from, channel, body, matchedEmail, receivedAt }) => ({ id, from, channel, body, matchedEmail, receivedAt }));
    const um = await getDocs(query(collection(getDb(), 'users', who.uid, 'unmatched_contacts'), limit(50)));
    const unmatched = um.docs.map((d) => d.data()).sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt))).slice(0, 25);
    return NextResponse.json({ items, unmatched }, { headers: NO_STORE });
  } catch (e) {
    console.error('[inbound messages] read failed:', e.message);
    return NextResponse.json({ error: 'Could not read the replies. Try again.' }, { status: 500, headers: NO_STORE });
  }
}
