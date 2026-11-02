// app/api/outlook-calendar/route.js - connect / disconnect the owner's Outlook (Microsoft 365) calendar for bookings.
//   GET -> status    POST -> { url }: where to send the owner for Microsoft's consent    DELETE -> disconnect
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../lib/server-firestore.js';
import { getDb, uidFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';
import { signState } from '../../../lib/server/token-vault.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { outlookConfigured, outlookRedirectUriFor, outlookAuthUrl, loadOutlookConnection, removeOutlookConnection } from '../../../lib/server/outlook-calendar.js';

const reply = (status, body) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  const available = isAdminMode() && outlookConfigured();
  const c = available ? await loadOutlookConnection(getDb(), uid) : null;
  return reply(200, { available, connected: !!c && c.status === 'ok', email: c?.email || null, connectedAt: c?.connectedAt || null });
}

export async function POST(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  if (!isAdminMode() || !outlookConfigured()) return reply(503, { error: 'Not set up on the server yet.' });
  const gate = await guardTenant(getDb(), uid, { feature: 'offlineGmail' });
  if (gate.response) return gate.response;
  const url = outlookAuthUrl({ redirectUri: outlookRedirectUriFor(request), state: signState(uid) });
  return reply(200, { url });
}

export async function DELETE(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  if (isAdminMode()) await removeOutlookConnection(getDb(), uid).catch(() => {});
  return reply(200, { disconnected: true });
}
