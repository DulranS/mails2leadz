// app/api/integrations/tally/connect/route.js - connects Tally with one API key: sets the form webhooks and the signing secret. Signed-in owner only.
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { identify, getDb, NO_STORE } from '../../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../../lib/server/tenant-guard.js';
import { writeAccountSecret } from '../../../../../lib/server/integration-secrets.js';
import { currentIntakeId } from '../../../../../lib/server/intake.js';
import { TALLY_API, tallyWebhookBody, tallyFormIdsFrom } from '../../../../../lib/tally-connect.js';
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
  if (token.length < 20) return NextResponse.json({ error: 'Paste your Tally API key.' }, { status: 400, headers: NO_STORE });
  const auth = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const list = await fetch(`${TALLY_API}/forms?page=1`, { headers: auth }).catch(() => null);
  if (!list?.ok) return NextResponse.json({ error: 'Tally did not accept the key. Check it and try again.' }, { status: 400, headers: NO_STORE });
  const ids = tallyFormIdsFrom(await list.json());
  if (!ids.length) return NextResponse.json({ error: 'No Tally forms were found on this account.' }, { status: 400, headers: NO_STORE });
  const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  const origin = /^https:\/\//.test(envBase) ? new URL(envBase).origin : request.nextUrl.origin;
  const intakeId = await currentIntakeId(db, who.uid);
  const secret = randomBytes(24).toString('base64url');
  const url = intakeUrl(origin, intakeId, 'tally');
  let set = 0;
  for (const id of ids) {
    const r = await fetch(`${TALLY_API}/webhooks`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(tallyWebhookBody(id, url, secret)) }).catch(() => null);
    if (r?.ok) set++;
  }
  if (!set) return NextResponse.json({ error: 'Tally did not set up the webhook. Check the key permissions.' }, { status: 400, headers: NO_STORE });
  await writeAccountSecret(db, who.uid, 'TALLY_SIGNING_SECRET', secret);
  return NextResponse.json({ ok: true, forms: set }, { headers: NO_STORE });
}
