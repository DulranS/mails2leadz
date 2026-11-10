// app/api/esign/route.js - send an agreement for e-signature, and read the status of each request. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../lib/rate-limit.js';
import { collection, getDocs, query, limit } from '../../../lib/server-firestore.js';
import { sendForSignature, checkOpenRequests } from '../../../lib/server/esign.js';

const limiter = makeLimiter({ limit: 30, windowMs: 3600000 });
const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: NO_STORE });

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const rows = (await getDocs(query(collection(db, 'users', who.uid, 'esign_requests'), limit(50)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return json({ requests: rows });
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  if (!limiter.hit(who.uid).ok) return json({ error: 'Too many sends for now.' }, 429);
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  if (body?.action === 'check') return json({ ok: true, ...(await checkOpenRequests(db, who.uid)) });
  if (body?.action === 'send') {
    const text = String(body.text || '').trim();
    const email = String(body.signerEmail || '').trim().toLowerCase();
    if (text.length < 40) return json({ error: 'The agreement text is too short to send.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter the signer\'s email address.' }, 400);
    const r = await sendForSignature(db, who.uid, { text, title: body.title || 'Agreement', signerEmail: email, signerName: String(body.signerName || '').trim(), testMode: body.testMode === true });
    return json(r, r.ok ? 200 : 400);
  }
  return json({ error: 'Unknown action.' }, 400);
}
