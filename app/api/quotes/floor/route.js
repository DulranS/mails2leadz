// app/api/quotes/floor/route.js - the owner sets the margin floor (the lowest acceptable margin on a quote, as a percentage).
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { doc, setDoc } from '../../../../lib/server-firestore.js';

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send the request as JSON.' }, { status: 400, headers: NO_STORE }); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const pct = Number(body?.percent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 95) return NextResponse.json({ error: 'The margin floor must be between 0 and 95 percent.' }, { status: 400, headers: NO_STORE });
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  await setDoc(doc(db, 'users', who.uid, 'settings', 'business'), { minMarginPercent: Math.round(pct * 10) / 10 }, { merge: true });
  return NextResponse.json({ ok: true, percent: Math.round(pct * 10) / 10 }, { headers: NO_STORE });
}
