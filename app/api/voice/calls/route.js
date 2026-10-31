// app/api/voice/calls/route.js - this account's AI calls, newest first: purpose, outcome and what was said. Owner's own data only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { collection, getDocs, limit, query, where } from '../../../../lib/server-firestore.js';

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  try {
    const snap = await getDocs(query(collection(getDb(), 'voice_calls'), where('userId', '==', who.uid), limit(50)));
    const items = snap.docs.map((d) => {
      const c = d.data();
      return { id: d.id, email: c.email, purpose: c.purpose, status: c.status, endReason: c.endReason || '', startedAt: c.startedAt, turns: (c.turns || []).map((t) => ({ role: t.role, text: t.text })) };
    }).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    return NextResponse.json({ items }, { headers: NO_STORE });
  } catch (e) {
    console.error('[voice calls] read failed:', e.message);
    return NextResponse.json({ error: 'Could not read the calls. Try again.' }, { status: 500, headers: NO_STORE });
  }
}
