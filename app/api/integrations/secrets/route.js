// app/api/integrations/secrets/route.js - store (or, with an empty value, remove) one key for THIS account. Encrypted at rest.
// The value is never returned. Needs TOKEN_ENC_KEY on the server: without it, nothing is stored in plain text.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { writeAccountSecret, vaultConfigured, SECRET_NAMES } from '../../../../lib/server/integration-secrets.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const name = String(body?.name || '');
  if (!SECRET_NAMES.includes(name)) return json({ error: 'That is not a connection key.' }, 400);
  const value = String(body?.value ?? '');
  if (value.trim() && !vaultConfigured()) {
    return json({ error: 'Keys cannot be stored for each account yet: the server owner needs to set TOKEN_ENC_KEY first. Self-hosted owners can put keys in the server settings instead.' }, 409);
  }
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  try {
    const r = await writeAccountSecret(db, who.uid, name, value);
    return json({ ok: true, name, set: r.set });
  } catch (e) {
    return json({ error: String(e?.message || 'Could not save the key.').slice(0, 160) }, 400);
  }
}
