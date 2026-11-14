// app/api/battle-card/route.js - a battle card for one customer before a call. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { battleCardFor } from '../../../lib/server/battle-card.js';

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  const r = await battleCardFor(db, who.uid, body?.email);
  return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: NO_STORE });
}
