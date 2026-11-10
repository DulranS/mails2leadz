// app/api/integrations/places/connect/route.js - connects Google Places with its API key, after a test search. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../../lib/server/tenant-guard.js';
import { writeAccountSecret } from '../../../../../lib/server/integration-secrets.js';
import { placesSearch } from '../../../../../lib/server/places-leads.js';

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  const key = String(body?.key || '').trim();
  if (key.length < 20) return NextResponse.json({ error: 'Paste your Google Places API key.' }, { status: 400, headers: NO_STORE });
  const test = await placesSearch(key, 'coffee shop');
  if (!test.ok) return NextResponse.json({ error: 'Google did not accept the key. Check that the Places API is enabled for it.' }, { status: 400, headers: NO_STORE });
  await writeAccountSecret(db, who.uid, 'GOOGLE_PLACES_API_KEY', key);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
