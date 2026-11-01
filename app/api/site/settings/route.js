// app/api/site/settings/route.js - the owner's landing page text: the tagline and the about paragraph.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { doc, getDoc, setDoc } from '../../../../lib/server-firestore.js';
import { sanitizeSite } from '../../../../lib/site.js';

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  const snap = await getDoc(doc(getDb(), 'users', who.uid, 'settings', 'site'));
  return NextResponse.json(snap.exists() ? snap.data() : { tagline: '', about: '' }, { headers: NO_STORE });
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send the request as JSON.' }, { status: 400, headers: NO_STORE }); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  const { site } = sanitizeSite(body);
  await setDoc(doc(db, 'users', who.uid, 'settings', 'site'), { ...site, updatedAt: new Date().toISOString() }, { merge: true });
  return NextResponse.json({ ok: true, ...site }, { headers: NO_STORE });
}
