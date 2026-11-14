// app/api/waitlist/route.js - the owner records a person who asked to be told when an item is back. Nobody is added without their own request. Signed-in owner only.
import { NextResponse } from 'next/server';
import { collection, addDoc, getDocs, query, limit } from '../../../lib/server-firestore.js';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { joinWaitlist, toNotify } from '../../../lib/waitlist.js';

const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: NO_STORE });

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const rows = (await getDocs(query(collection(db, 'users', who.uid, 'waitlist'), limit(500)))).docs.map((d) => d.data());
  return json({ waiting: rows });
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  const existing = (await getDocs(query(collection(db, 'users', who.uid, 'waitlist'), limit(500)))).docs.map((d) => d.data());
  const r = joinWaitlist(existing, { subject: body?.item, name: body?.name, email: body?.email });
  if (!r.added) return json({ ok: false, error: 'Enter the item and an email address, or this person is already on the list.' }, 400);
  await addDoc(collection(db, 'users', who.uid, 'waitlist'), { subject: String(body.item).trim().slice(0, 120), name: String(body.name || '').slice(0, 120), email: String(body.email).trim().toLowerCase(), at: new Date().toISOString() });
  return json({ ok: true, notifyNext: toNotify(r.list, String(body.item).trim(), 1).length });
}
