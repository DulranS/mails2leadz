// app/api/integrations/linkedin-leads/route.js - LinkedIn Lead Gen Forms. LinkedIn posts each submission here with the key from the
// webhook URL (?key=...), checked in constant time before anything is read. Leads land in the inbox as new; nothing is sent.
// Server settings: LINKEDIN_LEAD_KEY, FORMS_OWNER_UID.
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { storeLeads } from '../../../../lib/server/inbox-store.js';
import { linkedinKeyOk, leadFromLinkedin } from '../../../../lib/linkedin-leads.js';

export const maxDuration = 30;

export async function POST(request) {
  const env = process.env;
  if (!env.LINKEDIN_LEAD_KEY || !env.FORMS_OWNER_UID) {
    return NextResponse.json({ error: 'LinkedIn lead forms are not set up on the server.' }, { status: 503, headers: NO_STORE });
  }
  const presented = new URL(request.url).searchParams.get('key') || '';
  if (!linkedinKeyOk(presented, env.LINKEDIN_LEAD_KEY)) return NextResponse.json({ error: 'Not allowed.' }, { status: 401, headers: NO_STORE });
  const raw = await request.text();
  if (raw.length > 256 * 1024) return NextResponse.json({ error: 'Too large.' }, { status: 413, headers: NO_STORE });
  if (!isAdminMode()) return NextResponse.json({ error: 'Needs the server database connection.' }, { status: 503, headers: NO_STORE });
  let payload;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  const lead = leadFromLinkedin(payload);
  const stored = lead ? await storeLeads(getDb(), env.FORMS_OWNER_UID, [lead], { source: 'linkedin-lead-form' }) : null;
  return NextResponse.json({ received: lead ? 1 : 0, stored }, { headers: NO_STORE });
}
