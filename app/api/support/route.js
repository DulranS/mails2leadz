// app/api/support/route.js - the support queue and its measures for the signed-in owner.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { ticketsFor, setTicket } from '../../../lib/server/support-queue.js';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  return NextResponse.json(await ticketsFor(db, who.uid), { headers: NO_STORE });
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  const r = await setTicket(db, who.uid, String(body?.id || ''), String(body?.status || ''), String(body?.note || ''));
  return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: NO_STORE });
}
