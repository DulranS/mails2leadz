// app/api/integrations/tally/route.js - Tally submissions. The signature is checked (verifyTallySignature) before anything is read.
// Leads land in the inbox as new; nothing is sent to the person. Server settings: TALLY_SIGNING_SECRET, FORMS_OWNER_UID.
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { storeLeads } from '../../../../lib/server/inbox-store.js';
import { verifyTallySignature, leadFromTally } from '../../../../lib/form-webhooks.js';

export const maxDuration = 30;

export async function POST(request) {
  const env = process.env;
  if (!env.TALLY_SIGNING_SECRET || !env.FORMS_OWNER_UID) {
    return NextResponse.json({ error: 'Tally is not set up on the server.' }, { status: 503, headers: NO_STORE });
  }
  const raw = await request.text();
  if (raw.length > 256 * 1024) return NextResponse.json({ error: 'Too large.' }, { status: 413, headers: NO_STORE });
  if (!verifyTallySignature(raw, request.headers.get('tally-signature'), env.TALLY_SIGNING_SECRET)) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 401, headers: NO_STORE });
  }
  if (!isAdminMode()) return NextResponse.json({ error: 'Needs the server database connection.' }, { status: 503, headers: NO_STORE });
  let payload;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  const lead = leadFromTally(payload);
  const stored = lead ? await storeLeads(getDb(), env.FORMS_OWNER_UID, [lead], { source: 'tally' }) : null;
  return NextResponse.json({ received: lead ? 1 : 0, stored }, { headers: NO_STORE });
}
