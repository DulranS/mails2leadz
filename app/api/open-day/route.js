// app/api/open-day/route.js - called when the owner opens the app. Runs today's work once; later opens today change nothing. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { runOwnerDay, runSharedDay } from '../../../lib/server/open-day.js';

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const owner = await runOwnerDay(db, who.uid).catch(() => ({ ran: false, reason: 'could not run' }));
  const shared = await runSharedDay(db).catch(() => ({ ran: false, reason: 'could not run' }));
  // Reply checks are run by app/api/cron/check-replies with the stored Gmail token. This route used to call the browser-side check
  // without a token, which always failed and logged an error on every open, so it no longer does.
  const replies = null;
  return NextResponse.json({ owner: { ran: owner.ran, reason: owner.reason || null }, shared: { ran: shared.ran, reason: shared.reason || null }, replies }, { headers: NO_STORE });
}
