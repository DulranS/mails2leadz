// /api/customer-links - the owner's customer links: ticket status and rating links, and deal rooms. Signed-in owner only.
import { NextResponse } from 'next/server';
import { collection, doc, getDocs, setDoc, query, where, limit } from '../../../lib/server-firestore.js';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { newKey, ticketPaths, parseSteps } from '../../../lib/customer-links.js';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const tickets = (await getDocs(query(collection(db, 'users', who.uid, 'support_tickets'), limit(25)))).docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => t.accessKey).map((t) => ({ id: t.id, status: t.status || 'open', leadEmail: t.leadEmail || '', paths: ticketPaths(who.uid, t.id, t.accessKey) }));
  return NextResponse.json({ tickets }, { headers: NO_STORE });
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  if (body?.action !== 'deal_room') return NextResponse.json({ error: 'Unknown action.' }, { status: 400, headers: NO_STORE });
  const email = String(body.email || '').trim().toLowerCase();
  const deal = (await getDocs(query(collection(db, 'deals'), where('userId', '==', who.uid), where('email', '==', email), limit(1)))).docs[0];
  if (!deal) return NextResponse.json({ error: 'No deal with that email yet.' }, { status: 400, headers: NO_STORE });
  const key = deal.data().dealRoomKey || newKey();
  await setDoc(doc(db, 'deals', deal.id), { dealSteps: parseSteps(body.steps), dealRoomKey: key }, { merge: true });
  return NextResponse.json({ ok: true, path: `/room/${who.uid}/${deal.id}?k=${key}` }, { headers: NO_STORE });
}
