// app/api/integrations/dropbox-sign/connect/route.js - connects Dropbox Sign with its API key, after checking the key. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../../lib/server/tenant-guard.js';
import { writeAccountSecret } from '../../../../../lib/server/integration-secrets.js';
import { DROPBOX_SIGN } from '../../../../../lib/esign.js';

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  const key = String(body?.key || '').trim();
  if (key.length < 20) return NextResponse.json({ error: 'Paste your Dropbox Sign API key.' }, { status: 400, headers: NO_STORE });
  const r = await fetch(`${DROPBOX_SIGN}/account`, { headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` } }).catch(() => null);
  if (!r?.ok) return NextResponse.json({ error: 'Dropbox Sign did not accept the key. Check it and try again.' }, { status: 400, headers: NO_STORE });
  await writeAccountSecret(db, who.uid, 'DROPBOX_SIGN_API_KEY', key);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
