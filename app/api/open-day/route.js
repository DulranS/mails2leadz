// app/api/open-day/route.js - called when the owner opens the app. Runs today's work once; later opens today change nothing. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { runOwnerDay, runSharedDay } from '../../../lib/server/open-day.js';
import { POST as checkRepliesPOST } from '../check-replies/route.js';

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const owner = await runOwnerDay(db, who.uid).catch(() => ({ ran: false, reason: 'could not run' }));
  const shared = await runSharedDay(db).catch(() => ({ ran: false, reason: 'could not run' }));
  // The owner's own reply check, run with the owner's identity (the same logic as the Check replies button).
  let replies = null;
  try {
    const res = await checkRepliesPOST(new Request(request.url, { method: 'POST', headers: request.headers, body: '{}' }));
    replies = res.status;
  } catch (e) { replies = 'failed'; }
  return NextResponse.json({ owner: { ran: owner.ran, reason: owner.reason || null }, shared: { ran: shared.ran, reason: shared.reason || null }, replies }, { headers: NO_STORE });
}
