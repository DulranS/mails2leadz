// app/api/contacts/inbox/route.js - puts the contacts found by a company lookup into the lead inbox, the same way every other lead
// enters outreach. The inbox applies its own rules: opted-out people, people already emailed, and existing customers are skipped.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { storeLeads } from '../../../../lib/server/inbox-store.js';
import { validDomain } from '../../../../lib/server/enrich.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const domain = String(body?.domain || '').trim().toLowerCase();
  if (!validDomain(domain)) return json({ error: 'Choose the company first.' }, 400);
  const contacts = Array.isArray(body?.contacts) ? body.contacts.slice(0, 50) : [];
  if (!contacts.length) return json({ error: 'There are no contacts to add.' }, 400);
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  const leads = contacts.map((c) => {
    const parts = String(c?.name || '').trim().split(/\s+/);
    return {
      email: c?.email, business_name: domain, website: domain,
      first_name: parts[0] || '', last_name: parts.slice(1).join(' '),
      decision_maker_title: c?.position || '', campaign: 'Company lookup',
    };
  });
  try {
    const result = await storeLeads(db, who.uid, leads, { source: 'lookup', batchId: `lookup-${domain}-${Date.now()}` });
    return json({ ok: true, ...result });
  } catch (e) {
    console.error('[contacts/inbox] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not add the contacts. Try again.' }, 500);
  }
}
