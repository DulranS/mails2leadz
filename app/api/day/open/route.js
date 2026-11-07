// app/api/day/open/route.js - the first open of the day starts the owner's day (once). Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../../lib/rate-limit.js';
import { startDayFor } from '../../../../lib/server/day-start.js';

const limiter = makeLimiter({ limit: 12, windowMs: 60000 });

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const gate = limiter.hit(who.uid);
  if (!gate.ok) return NextResponse.json({ error: 'Slow down.' }, { status: 429, headers: NO_STORE });
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const r = await startDayFor(db, who.uid, { now: Date.now() });
  return NextResponse.json(r, { headers: NO_STORE });
}
