// app/api/integrations/typeform/connect/route.js - connects Typeform with one personal access token: sets up the webhooks for the owner's forms. Signed-in owner only.
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { identify, getDb, NO_STORE } from '../../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../../lib/server/tenant-guard.js';
import { writeAccountSecret } from '../../../../../lib/server/integration-secrets.js';
import { currentIntakeId } from '../../../../../lib/server/intake.js';
import { TYPEFORM_API, typeformWebhookBody, formIdsFrom } from '../../../../../lib/typeform-connect.js';
import { intakeUrl } from '../../../../../lib/intake.js';

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  const token = String(body?.token || '').trim();
  if (token.length < 20) return NextResponse.json({ error: 'Paste your Typeform personal access token.' }, { status: 400, headers: NO_STORE });
  const auth = { Authorization: `Bearer ${token}` };
  const list = await fetch(`${TYPEFORM_API}/forms?page_size=5`, { headers: auth }).catch(() => null);
  if (!list?.ok) return NextResponse.json({ error: 'Typeform did not accept the token. Check it and try again.' }, { status: 400, headers: NO_STORE });
  const ids = formIdsFrom(await list.json());
  if (!ids.length) return NextResponse.json({ error: 'No Typeform forms were found on this account.' }, { status: 400, headers: NO_STORE });
  const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  const origin = /^https:\/\//.test(envBase) ? new URL(envBase).origin : request.nextUrl.origin;
  const intakeId = await currentIntakeId(db, who.uid);
  const secret = randomBytes(24).toString('base64url');
  const url = intakeUrl(origin, intakeId, 'typeform');
  let set = 0;
  for (const id of ids) {
    const r = await fetch(`${TYPEFORM_API}/forms/${id}/webhooks/autoleads`, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(typeformWebhookBody(url, secret)) }).catch(() => null);
    if (r?.ok) set++;
  }
  if (!set) return NextResponse.json({ error: 'Typeform did not set up the webhook. Check the token permissions.' }, { status: 400, headers: NO_STORE });
  await writeAccountSecret(db, who.uid, 'TYPEFORM_WEBHOOK_SECRET', secret);
  return NextResponse.json({ ok: true, forms: set }, { headers: NO_STORE });
}
