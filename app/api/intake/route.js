// app/api/intake/route.js - lead forms for one owner, found by the owner's address (?id=). Each provider's own check runs with that owner's keys.
// No server keys are used here: an address that is not the owner's, or a key that is not theirs, gets nothing.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { storeLeads } from '../../../lib/server/inbox-store.js';
import { secretsFor } from '../../../lib/server/integration-secrets.js';
import { ownerForIntake } from '../../../lib/server/intake.js';
import { FORM_NAMES, checkForm, metaChallenge } from '../../../lib/intake.js';
import { leadFromFields } from '../../../lib/meta-leads.js';

const GRAPH = 'https://graph.facebook.com/v19.0';
const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const db = getDb();
  const uid = await ownerForIntake(db, p.get('id'));
  if (!uid) return json({ error: 'Not allowed.' }, 404);
  const s = await secretsFor(db, uid, FORM_NAMES, { env: {} }).catch(() => ({}));
  const challenge = metaChallenge(p, s);
  if (challenge !== null) return new NextResponse(challenge, { status: 200, headers: NO_STORE });
  return json({ error: 'Not allowed.' }, 403);
}

export async function POST(request) {
  const url = new URL(request.url);
  const db = getDb();
  const uid = await ownerForIntake(db, url.searchParams.get('id'));
  if (!uid) return json({ error: 'Not allowed.' }, 404);
  const provider = url.searchParams.get('p') || '';
  const s = await secretsFor(db, uid, FORM_NAMES, { env: {} }).catch(() => ({}));
  const raw = await request.text();
  const r = checkForm(provider, { raw, search: url.searchParams, headers: Object.fromEntries(request.headers) }, s);
  if (!r.ok) return json({ error: r.error }, r.status);
  let leads = r.leads || [];
  if (provider === 'meta') {
    for (const ev of r.events || []) {
      try {
        const res = await fetch(`${GRAPH}/${encodeURIComponent(ev.leadgenId)}?access_token=${encodeURIComponent(s.META_PAGE_ACCESS_TOKEN)}`);
        if (!res.ok) continue;
        const lead = leadFromFields((await res.json())?.field_data, { formId: ev.formId });
        if (lead) leads.push(lead);
      } catch (e) {
        console.error('[intake] meta lead fetch failed:', String(e?.message || '').slice(0, 120));
      }
    }
  }
  const stored = leads.length ? await storeLeads(db, uid, leads, { source: r.source }) : null;
  return json({ received: leads.length, stored });
}
