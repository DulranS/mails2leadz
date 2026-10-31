// app/api/integrations/test/route.js - the owner checks that a connection works, with this account's own keys. Read-only.
// Gmail is checked with the owner's own mailbox connection; AI is checked the first time it is used, so it is not tested here.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { openMailbox } from '../../../../lib/server/autosend.js';
import { secretsFor } from '../../../../lib/server/integration-secrets.js';
import { CHECK_KEYS, runConnectionCheck } from '../../../../lib/server/connection-test.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const service = String(body?.service || '');
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;

  if (service === 'gmail') {
    const box = await openMailbox(db, who.uid);
    return box.ok ? json({ ok: true, message: `Gmail is connected (${box.email}).` }) : json({ ok: false, message: 'Gmail is not connected or needs reconnecting in Account.' });
  }
  const names = CHECK_KEYS[service];
  if (!names) return json({ ok: false, message: 'Choose a connection to test.' }, 400);
  const secrets = await secretsFor(db, who.uid, names);
  const missing = names.filter((k) => !secrets[k]);
  if (missing.length) return json({ ok: false, message: `Still needed: ${missing.join(', ')}.` });
  return json(await runConnectionCheck(service, secrets));
}
