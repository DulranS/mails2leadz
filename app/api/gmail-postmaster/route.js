// app/api/gmail-postmaster/route.js - reads the spam rate Google Postmaster Tools measures for one sending domain, for the signed-in owner.
// Read-only: it uses the owner's own Postmaster grant (postmaster.traffic.readonly) and changes nothing at Google.
// Autosend does NOT use this figure; it keeps checking the owner's typed counts against the 0.3% line.
//   POST { domain, from, to } (YYYY-MM-DD, inclusive) -> { domain, from, to, rows, summary, unitNote }
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../lib/server-firestore.js';
import { getDb, uidFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { accessTokenFor } from '../../../lib/server/gmail-offline.js';
import { spamRateRequest, readSpamRate, summariseSpamRate, UNIT_NOTE } from '../../../lib/postmaster.js';

const reply = (status, body) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  if (!isAdminMode()) return reply(503, { error: 'Not set up on the server yet.' });
  const gate = await guardTenant(getDb(), uid, { feature: 'offlineGmail' });
  if (gate.response) return gate.response;

  const body = await request.json().catch(() => ({}));
  const req = spamRateRequest({ domain: body?.domain, from: body?.from, to: body?.to });
  if (!req) return reply(400, { error: 'Enter a domain such as example.com, and dates with the start on or before the end.' });

  const access = await accessTokenFor(getDb(), uid);
  if (access.none) return reply(409, { error: 'Connect Gmail first.' });
  if (access.expired) return reply(409, { error: access.error || 'Gmail access expired. Connect again.' });
  if (!access.canPostmaster) return reply(403, { error: 'Allow Postmaster Tools access first (under Gmail above).', needsConsent: true });
  if (!access.token) return reply(502, { error: access.error || 'Could not reach Google just now.' });

  let res;
  try {
    res = await fetch(req.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
  } catch {
    return reply(502, { error: 'Could not reach Google Postmaster Tools just now.' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const status = data?.error?.status || '';
    if (res.status === 403 || status === 'PERMISSION_DENIED') {
      return reply(403, { error: 'This Google account has no Postmaster Tools access to that domain. Add and verify the domain at postmaster.google.com with this account.' });
    }
    if (res.status === 404 || status === 'NOT_FOUND') {
      return reply(404, { error: 'Google has no Postmaster Tools data for that domain yet. It needs mail sent from it to Gmail first.' });
    }
    return reply(502, { error: 'Google Postmaster Tools did not return the spam rate for that domain.' });
  }

  const rows = readSpamRate(data);
  return reply(200, { domain: req.domain, from: body.from, to: body.to, rows, summary: summariseSpamRate(rows), unitNote: UNIT_NOTE });
}
