// /api/help/publish - shows whether the help centre is published, and switches it on or off. Signed-in owner only.
import { NextResponse } from 'next/server';
import { doc, setDoc } from '../../../../lib/server-firestore.js';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const { getDoc } = await import('../../../../lib/server-firestore.js');
  const biz = (await getDoc(doc(db, 'users', who.uid, 'settings', 'business')).then((s) => s.data() || {}).catch(() => ({})));
  return NextResponse.json({ published: biz.helpPublished === true, path: `/help/${who.uid}` }, { headers: NO_STORE });
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  if (typeof body?.published !== 'boolean') return NextResponse.json({ error: 'Say published: true or false.' }, { status: 400, headers: NO_STORE });
  await setDoc(doc(db, 'users', who.uid, 'settings', 'business'), { helpPublished: body.published }, { merge: true });
  return NextResponse.json({ ok: true, published: body.published, path: `/help/${who.uid}` }, { headers: NO_STORE });
}
