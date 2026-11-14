// app/api/contacts/export/route.js - a person's copy of their own data, downloaded as a file. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { exportContactData } from '../../../../lib/server/contact-export.js';

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send the request as JSON.' }, { status: 400, headers: NO_STORE }); }
  const r = await exportContactData(db, who.uid, body?.email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400, headers: NO_STORE });
  return new NextResponse(JSON.stringify(r.pack, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="their-data.json"', ...NO_STORE },
  });
}
