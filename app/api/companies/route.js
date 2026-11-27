// app/api/companies/route.js - companies grouped from the owner's people by email domain (lib/companies.js, pass 405).
// GET lists them with contact and deal counts. PUT saves the owner's name, website and notes for one company. Viewers can read only.
import { NextResponse } from 'next/server';
import { identify, getDb, actorFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';
import { collection, doc, getDocs, query, where, limit, setDoc } from '../../../lib/server-firestore.js';
import { groupCompanies, cleanCompanyDomain, sanitizeCompanyOverride } from '../../../lib/companies.js';

const MAX = 2000;

async function loadInputs(db, uid) {
  const [deals, contacts, overrides] = await Promise.all([
    getDocs(query(collection(db, 'deals'), where('userId', '==', String(uid)), limit(MAX))),
    getDocs(query(collection(db, 'users', String(uid), 'contacts'), limit(MAX))),
    getDocs(query(collection(db, 'users', String(uid), 'companies'), limit(MAX))),
  ]);
  const byDomain = {};
  for (const d of overrides.docs) byDomain[d.id] = d.data();
  return { deals: deals.docs.map((d) => d.data()), contacts: contacts.docs.map((d) => d.data()), overrides: byDomain };
}

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  const db = getDb();
  const companies = groupCompanies(await loadInputs(db, who.uid));
  return NextResponse.json({ companies }, { headers: NO_STORE });
}

export async function PUT(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  const actor = actorFromRequest(request);
  if (actor.role === 'viewer') {
    return NextResponse.json({ error: 'Viewers can read companies but cannot change them.', code: 'VIEWER_READ_ONLY' }, { status: 403, headers: NO_STORE });
  }
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send the company as JSON.' }, { status: 400, headers: NO_STORE }); }
  const domain = cleanCompanyDomain(body?.domain);
  if (!domain) return NextResponse.json({ error: 'That is not a company domain.' }, { status: 400, headers: NO_STORE });
  const s = sanitizeCompanyOverride(body);
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: 400, headers: NO_STORE });
  const db = getDb();
  const known = groupCompanies(await loadInputs(db, who.uid)).some((c) => c.domain === domain);
  if (!known) return NextResponse.json({ error: 'No one on your records uses that domain.' }, { status: 404, headers: NO_STORE });
  await setDoc(doc(db, 'users', String(who.uid), 'companies', domain), s.value, { merge: true });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
