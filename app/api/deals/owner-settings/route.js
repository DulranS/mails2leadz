// app/api/deals/owner-settings/route.js - the owner sets who is away, how many open deals each person takes, and which territories they cover.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { ownersFor, saveOwnerSettings } from '../../../../lib/server/owner-settings.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  const key = String(body?.key || '');
  if (!(await ownersFor(db, who.uid)).some((o) => o.key === key)) return json({ error: 'Only the owner or a team manager can be set here.' }, 400);
  try {
    const entry = await saveOwnerSettings(db, who.uid, key, body);
    return json({ ok: true, ...entry });
  } catch (e) {
    console.error('[owner-settings] save failed:', e.message);
    return json({ error: 'Could not save. Try again.' }, 500);
  }
}
