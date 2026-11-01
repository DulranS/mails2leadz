// app/api/webhooks/route.js - the owner's outgoing webhook addresses: list them, add one (its secret is shown once), or remove one.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { listEndpoints, addEndpoint, removeEndpoint, WEBHOOK_EVENTS } from '../../../lib/server/webhooks.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  try { return json({ items: await listEndpoints(getDb(), who.uid), events: WEBHOOK_EVENTS }); }
  catch (e) { console.error('[webhooks] read failed:', e.message); return json({ error: 'Could not read the webhooks.' }, 500); }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  try {
    if (body?.action === 'remove') return json(await removeEndpoint(db, who.uid, String(body.id || '').slice(0, 40)));
    const r = await addEndpoint(db, who.uid, { url: body?.url, events: body?.events });
    if (r.error) return json({ error: r.error }, 400);
    return json({ ok: true, id: r.id, secret: r.secret, note: 'Copy the secret now. It is not shown again.' });
  } catch (e) {
    console.error('[webhooks] save failed:', e.message);
    return json({ error: 'Could not save the webhook. Try again.' }, 500);
  }
}
