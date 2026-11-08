// app/api/support/library/route.js - the owner's answer library for automatic replies: "question | answer" lines. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { doc, getDoc, setDoc } from '../../../../lib/server-firestore.js';
import { cleanLibrary } from '../../../../lib/support-bot.js';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const biz = (await getDoc(doc(db, 'users', who.uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
  return NextResponse.json({ library: cleanLibrary(biz.supportLibrary) }, { headers: NO_STORE });
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  const pairs = String(body?.text || '').split(/\r?\n/).map((line) => line.split('|')).filter((p) => p.length >= 2).map(([q, ...a]) => ({ q, a: a.join('|') }));
  const library = cleanLibrary(pairs);
  await setDoc(doc(db, 'users', who.uid, 'settings', 'business'), { supportLibrary: library, updatedAt: new Date().toISOString() }, { merge: true });
  return NextResponse.json({ ok: true, saved: library.length }, { headers: NO_STORE });
}
