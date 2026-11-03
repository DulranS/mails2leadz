// app/api/integrations/meta-leads/route.js - Meta Lead Ads. Meta calls GET once to verify the subscription, then POST for each new
// lead. POST is checked with verifyMetaSignature (the app secret) before anything is read. Leads land in the inbox as "new".
// Five server settings switch it on: META_APP_SECRET, META_VERIFY_TOKEN, META_PAGE_ACCESS_TOKEN, META_PAGE_ID, META_OWNER_UID.
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { storeLeads } from '../../../../lib/server/inbox-store.js';
import { verifyMetaSignature, leadgenEvents, leadFromFields } from '../../../../lib/meta-leads.js';

export const maxDuration = 60;
const GRAPH = 'https://graph.facebook.com/v19.0';

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  if (p.get('hub.mode') === 'subscribe' && process.env.META_VERIFY_TOKEN && p.get('hub.verify_token') === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(p.get('hub.challenge') || '', { status: 200, headers: NO_STORE });
  }
  return NextResponse.json({ error: 'Not allowed.' }, { status: 403, headers: NO_STORE });
}

export async function POST(request) {
  const env = process.env;
  if (!env.META_APP_SECRET || !env.META_PAGE_ACCESS_TOKEN || !env.META_PAGE_ID || !env.META_OWNER_UID) {
    return NextResponse.json({ error: 'Meta Lead Ads is not set up on the server.' }, { status: 503, headers: NO_STORE });
  }
  const raw = await request.text();
  if (raw.length > 512 * 1024) return NextResponse.json({ error: 'Too large.' }, { status: 413, headers: NO_STORE });
  if (!verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), env.META_APP_SECRET)) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 401, headers: NO_STORE });
  }
  if (!isAdminMode()) return NextResponse.json({ error: 'Needs the server database connection.' }, { status: 503, headers: NO_STORE });
  let payload;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }

  const leads = [];
  for (const ev of leadgenEvents(payload).filter((e) => e.pageId === env.META_PAGE_ID).slice(0, 50)) {
    try {
      const r = await fetch(`${GRAPH}/${encodeURIComponent(ev.leadgenId)}?access_token=${encodeURIComponent(env.META_PAGE_ACCESS_TOKEN)}`);
      if (!r.ok) continue;
      const lead = leadFromFields((await r.json())?.field_data, { formId: ev.formId });
      if (lead) leads.push(lead);
    } catch (e) {
      console.error('[meta-leads] lead fetch failed:', String(e?.message || '').slice(0, 120));
    }
  }
  let stored = null;
  if (leads.length) stored = await storeLeads(getDb(), env.META_OWNER_UID, leads, { source: 'meta-lead-ads' });
  return NextResponse.json({ received: leads.length, stored }, { headers: NO_STORE });
}
