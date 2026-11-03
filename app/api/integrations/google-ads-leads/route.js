// app/api/integrations/google-ads-leads/route.js - Google Ads lead form extensions. Google POSTs each submission here; the request
// is checked against the shared key (googleKeyOk) before anything is read. Leads land in the inbox as new; nothing is sent to them.
// Three server settings switch it on: GOOGLE_ADS_LEAD_KEY (the key you set in the lead form's webhook), GOOGLE_ADS_OWNER_UID.
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { storeLeads } from '../../../../lib/server/inbox-store.js';
import { googleKeyOk, leadFromGoogle } from '../../../../lib/google-leads.js';

export const maxDuration = 30;

export async function POST(request) {
  const env = process.env;
  if (!env.GOOGLE_ADS_LEAD_KEY || !env.GOOGLE_ADS_OWNER_UID) {
    return NextResponse.json({ error: 'Google Ads lead forms are not set up on the server.' }, { status: 503, headers: NO_STORE });
  }
  const raw = await request.text();
  if (raw.length > 256 * 1024) return NextResponse.json({ error: 'Too large.' }, { status: 413, headers: NO_STORE });
  let payload;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  if (!googleKeyOk(payload, env.GOOGLE_ADS_LEAD_KEY)) return NextResponse.json({ error: 'Not allowed.' }, { status: 401, headers: NO_STORE });
  if (!isAdminMode()) return NextResponse.json({ error: 'Needs the server database connection.' }, { status: 503, headers: NO_STORE });
  const lead = leadFromGoogle(payload);
  const stored = lead ? await storeLeads(getDb(), env.GOOGLE_ADS_OWNER_UID, [lead], { source: 'google-lead-form' }) : null;
  return NextResponse.json({ received: lead ? 1 : 0, stored }, { headers: NO_STORE });
}
