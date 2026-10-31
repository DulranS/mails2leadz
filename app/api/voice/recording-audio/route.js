// app/api/voice/recording-audio/route.js - the owner plays a call recording. The audio is fetched with THIS account's Twilio keys.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { getDoc, doc } from '../../../../lib/server-firestore.js';
import { secretsFor, CALL_NAMES } from '../../../../lib/server/integration-secrets.js';

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  const id = String(new URL(request.url).searchParams.get('id') || '').slice(0, 80);
  if (!id) return NextResponse.json({ error: 'Choose the call.' }, { status: 400, headers: NO_STORE });
  const db = getDb();
  const snap = await getDoc(doc(db, 'voice_calls', id));
  if (!snap.exists() || snap.data().userId !== who.uid) return NextResponse.json({ error: 'This call could not be found.' }, { status: 404, headers: NO_STORE });
  const url = snap.data().recording?.url;
  if (!url) return NextResponse.json({ error: 'The recording is not ready yet.' }, { status: 404, headers: NO_STORE });
  const s = await secretsFor(db, who.uid, CALL_NAMES);
  if (!s.TWILIO_ACCOUNT_SID || !s.TWILIO_AUTH_TOKEN) return NextResponse.json({ error: 'Phone calls are not set up for this account.' }, { status: 409, headers: NO_STORE });
  const res = await fetch(url, { headers: { Authorization: `Basic ${Buffer.from(`${s.TWILIO_ACCOUNT_SID}:${s.TWILIO_AUTH_TOKEN}`).toString('base64')}` } });
  if (!res.ok) return NextResponse.json({ error: 'The recording could not be fetched. Try again later.' }, { status: 502, headers: NO_STORE });
  return new NextResponse(res.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store' } });
}
