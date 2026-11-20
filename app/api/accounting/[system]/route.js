// app/api/accounting/[system]/route.js - connect / disconnect the owner's Xero or QuickBooks (pass 341).
//   GET -> status    POST -> { url }: where to send the owner for consent    DELETE -> disconnect (our copy of the grant only)
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, uidFromRequest, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { signState, vaultConfigured } from '../../../../lib/server/token-vault.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { isSystem, clientKeysSet, authorizeUrl } from '../../../../lib/accounting-sync.js';
import { connectionInfo, accountingStore, accountingRedirectFor } from '../../../../lib/server/accounting-store.js';

const reply = (status, body) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request, { params }) {
  const { system } = await params;
  if (!isSystem(system)) return reply(404, { error: 'Unknown accounting system.' });
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  const available = isAdminMode() && vaultConfigured() && clientKeysSet(system);
  const info = available ? await connectionInfo(getDb(), uid, system) : null;
  return reply(200, { available, connected: !!info?.connected, tenantId: info?.tenantId || null, connectedAt: info?.connectedAt || null });
}

export async function POST(request, { params }) {
  const { system } = await params;
  if (!isSystem(system)) return reply(404, { error: 'Unknown accounting system.' });
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  // Not configured is a state, not a crash: the page shows it and nothing is sent to the provider.
  if (!isAdminMode() || !vaultConfigured() || !clientKeysSet(system)) return reply(503, { error: 'Not set up on the server yet.', code: 'NOT_CONFIGURED' });
  const gate = await guardTenant(getDb(), uid, { feature: 'offlineGmail' });
  if (gate.response) return gate.response;
  const clientId = process.env[`${system === 'xero' ? 'XERO' : 'QBO'}_CLIENT_ID`];
  const url = authorizeUrl(system, { clientId, redirectUri: accountingRedirectFor(system, request), state: signState(uid) });
  return reply(200, { url });
}

export async function DELETE(request, { params }) {
  const { system } = await params;
  if (!isSystem(system)) return reply(404, { error: 'Unknown accounting system.' });
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  if (isAdminMode()) await accountingStore(getDb(), uid).removeConnection(system).catch(() => {});
  return reply(200, { disconnected: true });
}
