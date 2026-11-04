// app/api/loyalty/route.js - the owner reads a customer's points balance. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { balanceFor } from '../../../lib/server/loyalty.js';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const email = new URL(request.url).searchParams.get('email') || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: 'Give a customer email.' }, { status: 400, headers: NO_STORE });
  return NextResponse.json({ points: await balanceFor(db, who.uid, email) }, { headers: NO_STORE });
}
