// app/api/accounting/sync/route.js - push issued invoices to Xero or QuickBooks, or poll them for payment (pass 341).
//   POST { system, action: "push" | "poll" }. Signed-in owner only; a team viewer may read but not sync.
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../../lib/server-firestore.js';
import { identify, getDb, actorFromRequest, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { vaultConfigured } from '../../../../lib/server/token-vault.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { isSystem, clientKeysSet, runPush, runPoll } from '../../../../lib/accounting-sync.js';
import { accountingStore } from '../../../../lib/server/accounting-store.js';

export async function POST(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  const actor = actorFromRequest(request);
  if (actor.role === 'viewer') return NextResponse.json({ error: 'Viewers cannot sync accounting.', code: 'VIEWER_READ_ONLY' }, { status: 403, headers: NO_STORE });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send the sync request as JSON.' }, { status: 400, headers: NO_STORE }); }
  const system = String(body?.system || '');
  if (!isSystem(system)) return NextResponse.json({ error: 'Choose xero or quickbooks.' }, { status: 400, headers: NO_STORE });
  const action = String(body?.action || '');
  if (action !== 'push' && action !== 'poll') return NextResponse.json({ error: 'Choose push or poll.' }, { status: 400, headers: NO_STORE });
  if (!isAdminMode() || !vaultConfigured() || !clientKeysSet(system)) return NextResponse.json({ error: 'Not set up on the server yet.', code: 'NOT_CONFIGURED' }, { status: 503, headers: NO_STORE });
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  try {
    const store = accountingStore(db, who.uid);
    const result = action === 'push' ? await runPush({ store, system }) : await runPoll({ store, system });
    if (result.error === 'not_connected') return NextResponse.json({ error: 'Connect this account first.', code: 'NOT_CONNECTED' }, { status: 409, headers: NO_STORE });
    return NextResponse.json({ ok: true, action, ...result }, { headers: NO_STORE });
  } catch (e) {
    console.error('[accounting sync]', system, action, e?.code || e?.message);
    return NextResponse.json({ error: 'The sync could not run. Try again in a minute.' }, { status: 500, headers: NO_STORE });
  }
}
