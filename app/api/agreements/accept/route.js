// app/api/agreements/accept/route.js - the customer reads an agreement by its link and accepts it by typed name. Public, rate limited, keeps no raw IP.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { makeLimiter } from '../../../../lib/rate-limit.js';
import { doc, getDoc, setDoc } from '../../../../lib/server-firestore.js';
import { sha256, acceptanceState, validName, ipHash } from '../../../../lib/acceptance.js';

const limiter = makeLimiter({ limit: 20, windowMs: 3600000 });
const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: NO_STORE });
const validToken = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{20,80}$/.test(t);

export async function GET(request) {
  const t = new URL(request.url).searchParams.get('t') || '';
  if (!validToken(t)) return json({ state: 'not_found' }, 404);
  const snap = await getDoc(doc(getDb(), 'agreement_acceptances', sha256(t))).catch(() => null);
  const data = snap?.data?.();
  const state = acceptanceState(data);
  if (state !== 'open' && state !== 'accepted') return json({ state }, state === 'not_found' ? 404 : 200);
  return json({ state, title: data.title, text: data.text, acceptedName: data.acceptedName || null, acceptedAt: data.acceptedAt || null });
}

export async function POST(request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!limiter.hit(`accept:${ip}`).ok) return json({ error: 'Too many attempts. Try again later.' }, 429);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  const t = String(body?.t || '');
  if (!validToken(t)) return json({ error: 'This link is not valid.' }, 404);
  const ref = doc(getDb(), 'agreement_acceptances', sha256(t));
  const data = (await getDoc(ref).catch(() => null))?.data?.();
  const state = acceptanceState(data);
  if (state === 'not_found') return json({ error: 'This link is not valid.' }, 404);
  if (state === 'expired') return json({ error: 'This link has expired. Ask for a new one.' }, 410);
  if (state === 'accepted') return json({ error: 'This agreement has already been accepted.' }, 409);
  const name = validName(body?.name);
  if (!name) return json({ error: 'Type your full name as it appears on your documents.' }, 400);
  const at = new Date().toISOString();
  await setDoc(ref, { acceptedAt: at, acceptedName: name, acceptedIpHash: ipHash(ip), acceptedUserAgent: String(request.headers.get('user-agent') || '').slice(0, 200) }, { merge: true });
  return json({ ok: true, acceptedAt: at, acceptedName: name }, 200);
}
