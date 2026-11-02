// app/api/promos/route.js - the owner's discount codes: list, create, and switch off. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../lib/rate-limit.js';
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, updateDoc } from '../../../lib/server-firestore.js';
import { sanitizePromo, normalizeCode, PROMO_LIMITS } from '../../../lib/promo.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const limiter = makeLimiter({ limit: 30, windowMs: 60000 });
const idFor = (uid, code) => `${uid}_${code}`;

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const snap = await getDocs(query(collection(db, 'promos'), where('userId', '==', who.uid), limit(PROMO_LIMITS.perAccount)));
  const items = snap.docs.map((d) => { const x = d.data(); return { code: x.code, type: x.type, value: x.value, minAmount: x.minAmount, maxUses: x.maxUses, uses: Number(x.uses) || 0, validFrom: x.validFrom || null, validTo: x.validTo || null, oncePerCustomer: !!x.oncePerCustomer, active: x.active !== false, note: x.note || '' }; });
  return json({ items });
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;
  const gate0 = limiter.hit(uid);
  if (!gate0.ok) return json({ error: `Too many changes. Try again in ${gate0.retryAfterSec} seconds.` }, 429);
  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;
  try {
    if (body?.action === 'disable') {
      const code = normalizeCode(body?.code);
      const ref = doc(db, 'promos', idFor(uid, code));
      const snap = code ? await getDoc(ref) : null;
      if (!snap || !snap.exists() || snap.data().userId !== uid) return json({ error: 'That code was not found.' }, 404);
      await updateDoc(ref, { active: false, disabledAt: new Date().toISOString() });
      return json({ ok: true });
    }
    if (body?.action === 'create') {
      const clean = sanitizePromo(body);
      if (!clean.ok) return json({ error: clean.error }, 400);
      const count = await getDocs(query(collection(db, 'promos'), where('userId', '==', uid), limit(PROMO_LIMITS.perAccount + 1)));
      if (count.size >= PROMO_LIMITS.perAccount) return json({ error: `You can keep up to ${PROMO_LIMITS.perAccount} codes. Switch some off first.` }, 400);
      const ref = doc(db, 'promos', idFor(uid, clean.value.code));
      if ((await getDoc(ref)).exists()) return json({ error: 'You already have a code with that name.' }, 409);
      await setDoc(ref, { userId: uid, ...clean.value, uses: 0, createdAt: new Date().toISOString() });
      return json({ ok: true, code: clean.value.code });
    }
    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    console.error('[promos] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not save the code. Try again.' }, 500);
  }
}
