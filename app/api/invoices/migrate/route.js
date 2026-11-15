// app/api/invoices/migrate/route.js - copies this owner's invoices from before the single invoice store into it.
// The billing screens call this before they read invoices, so an owner sees every invoice without waiting for the daily run.
// Safe to repeat: a copy is skipped once it is done (the same routine the daily job uses).
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { moveLegacyInvoices } from '../../../../lib/server/invoice-store.js';

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  try {
    const r = await moveLegacyInvoices(db, who.uid);
    return NextResponse.json({ ok: true, moved: r.moved, done: r.done }, { headers: NO_STORE });
  } catch (e) {
    console.error('[invoices/migrate] failed:', String(e?.message || '').slice(0, 120));
    return NextResponse.json({ ok: false, error: 'Could not bring older invoices across yet.' }, { status: 500, headers: NO_STORE });
  }
}
