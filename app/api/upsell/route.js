// /api/upsell?email=... - upsell options for one customer, from what they bought and what can be supplied now. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { upsellFor } from '../../../lib/server/upsell.js';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const email = new URL(request.url).searchParams.get('email') || '';
  const r = await upsellFor(db, who.uid, email);
  return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: NO_STORE });
}
