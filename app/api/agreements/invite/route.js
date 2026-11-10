// app/api/agreements/invite/route.js - makes a one-time acceptance link for an agreement the owner has written. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { collection, doc, setDoc } from '../../../../lib/server-firestore.js';
import { newAcceptToken, documentHash, ACCEPT_DAYS } from '../../../../lib/acceptance.js';

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  const text = String(body?.text || '').trim();
  if (text.length < 40 || text.length > 20000) return NextResponse.json({ error: 'The agreement text is missing or too long.' }, { status: 400, headers: NO_STORE });
  const { token, tokenHash } = newAcceptToken();
  const now = Date.now();
  await setDoc(doc(db, 'agreement_acceptances', tokenHash), {
    userId: who.uid, text: text.slice(0, 20000), documentHash: documentHash(text), title: String(body?.title || 'Agreement').slice(0, 120),
    intendedFor: String(body?.email || '').slice(0, 200), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + ACCEPT_DAYS * 86400000).toISOString(), acceptedAt: null,
  });
  const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  const origin = /^https:\/\//.test(envBase) ? new URL(envBase).origin : request.nextUrl.origin;
  return NextResponse.json({ ok: true, link: `${origin}/accept/${token}`, expiresInDays: ACCEPT_DAYS }, { headers: NO_STORE });
}
