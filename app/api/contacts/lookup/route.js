// app/api/contacts/lookup/route.js - the owner looks up the public contacts at a company's domain, with this account's own Hunter key.
// Nothing is saved and nothing is sent: the result is a list to choose from.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { secretsFor, ENRICH_NAMES } from '../../../../lib/server/integration-secrets.js';
import { validDomain, fetchHunterDomain } from '../../../../lib/server/enrich.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const domain = String(body?.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (!validDomain(domain)) return json({ error: 'Enter a company website domain, for example example.com.' }, 400);
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  const { HUNTER_API_KEY: apiKey } = await secretsFor(db, who.uid, ENRICH_NAMES);
  if (!apiKey) return json({ error: 'Contact lookup is not connected. Add a Hunter key on the Integrations page.' }, 409);
  try {
    const contacts = await fetchHunterDomain({ apiKey, domain });
    return json({ ok: true, domain, contacts });
  } catch (e) {
    console.error('[enrich] lookup failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'The contact lookup did not return results. Check the Hunter key, then try again.' }, 502);
  }
}
