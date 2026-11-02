// app/api/calendar-offline/route.js - connect / disconnect the owner's Google Calendar, for writing confirmed bookings to it.
//   GET -> status    POST -> { url }: where to send the owner for Google's consent    DELETE -> disconnect (revoked at Google)
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../lib/server-firestore.js';
import { getDb, uidFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';
import { signState } from '../../../lib/server/token-vault.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { oauthClient, offlineConfigured } from '../../../lib/server/gmail-offline.js';
import { CALENDAR_SCOPE, calendarRedirectUriFor, loadCalendarConnection, removeCalendarConnection } from '../../../lib/server/calendar-write.js';

const reply = (status, body) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  const available = isAdminMode() && offlineConfigured();
  const c = available ? await loadCalendarConnection(getDb(), uid) : null;
  return reply(200, { available, connected: !!c && c.status === 'ok', email: c?.email || null, connectedAt: c?.connectedAt || null });
}

export async function POST(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  if (!isAdminMode() || !offlineConfigured()) return reply(503, { error: 'Not set up on the server yet.' });
  const gate = await guardTenant(getDb(), uid, { feature: 'offlineGmail' });
  if (gate.response) return gate.response;
  const url = oauthClient(calendarRedirectUriFor(request)).generateAuthUrl({
    access_type: 'offline', prompt: 'consent', scope: [CALENDAR_SCOPE], include_granted_scopes: false, state: signState(uid),
  });
  return reply(200, { url });
}

export async function DELETE(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  if (isAdminMode()) await removeCalendarConnection(getDb(), uid).catch(() => {});
  return reply(200, { disconnected: true });
}
