// app/api/admin/partners/route.js - the operator's software partner programme (pass 348). ADMIN_EMAILS only.
//   GET  -> every partner, the terms in force, and what each partner is owed per currency
//   POST { action: 'create', partner: { name, email, company, payoutMethod, payoutNote } } -> a new partner with a fresh code
//   POST { action: 'status', code, status: 'active' | 'paused' | 'ended' }
//   POST { action: 'payout', code, currency, amountMinor, reference } -> records a payment you made to the partner
// Every change is written to `admin_audit`. The operator sees partner names and money, never a customer's leads or deals.
import { NextResponse } from 'next/server';
import { collection, addDoc, isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, requireAdmin, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { listPartners, createPartner, setPartnerStatus, recordPayout, statementLinkFor } from '../../../../lib/server/software-partners.js';
import { normalizeCode } from '../../../../lib/software-partners.js';

const reply = (status, body) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request) {
  const admin = requireAdmin(request);
  if (admin.response) return admin.response;
  if (!isAdminMode()) return reply(200, { partners: [], terms: null, note: 'The server is not connected to the database with a service account.' });
  const data = await listPartners(getDb());
  const origin = new URL(request.url).origin;
  return reply(200, { ...data, partners: data.partners.map((x) => ({ ...x, statementLink: statementLinkFor(origin, x.code) })) });
}

export async function POST(request) {
  const admin = requireAdmin(request);
  if (admin.response) return admin.response;
  if (!isAdminMode()) return reply(503, { error: 'The server is not connected to the database.' });
  let body;
  try { body = await request.json(); } catch { return reply(400, { error: 'Bad request.' }); }
  const db = getDb();
  const code = normalizeCode(body?.code) || '';
  let out;
  if (body?.action === 'create') out = await createPartner(db, body.partner || {});
  else if (body?.action === 'status') out = await setPartnerStatus(db, code, String(body.status || ''));
  else if (body?.action === 'payout') out = await recordPayout(db, code, { currency: body.currency, amountMinor: body.amountMinor, reference: body.reference });
  else return reply(400, { error: 'Unknown action.' });
  if (out.error) return reply(400, { error: out.error });
  await addDoc(collection(db, 'admin_audit'), {
    at: new Date().toISOString(), by: admin.email, action: `partner_${body.action}`, summary: `${body.action} ${out.partner?.code || code}`.slice(0, 200),
  });
  return reply(200, out);
}
