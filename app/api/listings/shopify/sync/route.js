// app/api/listings/shopify/sync/route.js - sends the owner's changed products to their own Shopify store, on request. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../../../lib/rate-limit.js';
import { syncProductsToShopify } from '../../../../../lib/server/shopify-sync.js';

const limiter = makeLimiter({ limit: 10, windowMs: 3600000 });

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const gate = limiter.hit(who.uid);
  if (!gate.ok) return NextResponse.json({ error: 'Synced recently. Try again in a little while.' }, { status: 429, headers: NO_STORE });
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const r = await syncProductsToShopify(db, who.uid);
  return NextResponse.json(r, { headers: NO_STORE });
}
