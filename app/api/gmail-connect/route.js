// app/api/gmail-connect/route.js - the owner's optional READ-ONLY Gmail connection ("Reply watch" on the Account page).
//
//   GET     -> status (never the token)
//   POST    { code }            -> connect: trades the one-time Google pop-up code for a stored, encrypted, read-only refresh token
//   POST    { action: 'check' } -> look for replies right now, using the stored connection (one batch)
//   PATCH   { enabled }         -> pause / resume the timed check
//   DELETE  -> disconnect: Google is told to cancel the token and everything stored is deleted
// The signed-in owner comes from proxy.js (x-user-id), never from the body.
import { NextResponse } from 'next/server';
import { getDb, uidFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';
import {
  reachable, canConnect, loadConnection, publicStatus, exchangeCode, saveConnection, setEnabled, disconnect, gmailFor, recordRun,
} from '../../../lib/server/gmail-connection.js';
import { runReplyCheck, GmailAuthError } from '../../../lib/server/reply-check.js';
import { REPLY_CHECK_BATCH } from '../../../lib/reply-pick.js';

export const maxDuration = 60;

const reply = (status, body) => NextResponse.json(body, { status, headers: NO_STORE });
const CODE_RE = /^[A-Za-z0-9_\-./]{10,2048}$/;

export async function GET(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  const r = reachable();
  const conn = r.adminMode ? await loadConnection(getDb(), uid).catch(() => null) : null;
  return reply(200, { ...r, available: canConnect(), clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '', ...publicStatus(conn) });
}

export async function POST(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  if (!canConnect()) return reply(503, { error: 'This needs the server set up first (service account, GMAIL_TOKEN_KEY and the Google client). See the deployment guide.' });
  const body = await request.json().catch(() => ({}));
  const db = getDb();

  if (body?.action === 'check') {
    const conn = await loadConnection(db, uid);
    if (!conn) return reply(409, { error: 'Connect Gmail first.' });
    const gmail = gmailFor(conn, uid);
    if (!gmail) return reply(409, { error: 'The stored connection cannot be read. Disconnect and connect again.' });
    try {
      const result = await runReplyCheck({ db, gmail, userId: uid, senderEmail: conn.email, max: REPLY_CHECK_BATCH, deadline: Date.now() + 50000 });
      await recordRun(db, uid, conn, { result, found: result.triage });
      return reply(200, { success: true, checked: result.checked, replies: result.replyCount, autoReplies: result.autoReplies, bounced: result.bounced.length, waiting: result.waiting, triage: result.triage });
    } catch (e) {
      if (e instanceof GmailAuthError) {
        await recordRun(db, uid, conn, { error: 'Google cancelled or expired this connection.', needsReconnect: true });
        return reply(200, { success: false, code: 'NEEDS_RECONNECT', error: 'Google cancelled or expired the connection. Please connect again.' });
      }
      console.error('[gmail-connect] check failed:', e?.message);
      return reply(500, { error: 'Could not check right now. Try again in a minute.' });
    }
  }

  const code = String(body?.code || '');
  if (!CODE_RE.test(code)) return reply(400, { error: 'Missing or invalid Google sign-in code.' });
  try {
    const t = await exchangeCode(code);
    await saveConnection(db, uid, { ...t, appEmail: request.headers.get('x-user-email') || '' });
    return reply(200, { success: true, ...publicStatus(await loadConnection(db, uid)) });
  } catch (e) {
    return reply(422, { error: e?.message || 'Could not connect Gmail.' });
  }
}

export async function PATCH(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  const body = await request.json().catch(() => ({}));
  if (typeof body?.enabled !== 'boolean') return reply(400, { error: 'enabled must be true or false.' });
  const db = getDb();
  if (!(await loadConnection(db, uid))) return reply(409, { error: 'Connect Gmail first.' });
  await setEnabled(db, uid, body.enabled);
  return reply(200, { success: true, enabled: body.enabled });
}

export async function DELETE(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  try {
    await disconnect(getDb(), uid);
    return reply(200, { success: true });
  } catch (e) {
    console.error('[gmail-connect] disconnect failed:', e?.message);
    return reply(500, { error: 'Could not disconnect right now. Try again.' });
  }
}
