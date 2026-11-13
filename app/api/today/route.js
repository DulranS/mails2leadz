// app/api/today/route.js - what needs a person today, most urgent first. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { todayItems } from '../../../lib/server/today-actions.js';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  return NextResponse.json({ items: await todayItems(db, who.uid) }, { headers: NO_STORE });
}
