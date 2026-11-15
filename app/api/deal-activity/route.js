// app/api/deal-activity/route.js - the owner logs a call, meeting or note against a customer. It then shows in that customer's history.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { collection, addDoc, doc, getDoc, updateDoc, deleteDoc } from '../../../lib/server-firestore.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { cleanActivity, cleanEdit } from '../../../lib/deal-activity.js';

const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: NO_STORE });

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Send the entry as JSON.' }, 400); }
  const r = cleanActivity(body);
  if (r.error) return json({ ok: false, error: r.error }, 400);
  try {
    const ref = await addDoc(collection(db, 'deal_activity'), { userId: who.uid, ...r.value, createdAt: new Date().toISOString() });
    return json({ ok: true, id: ref.id });
  } catch (e) {
    console.error('[deal-activity] save failed:', String(e?.message || '').slice(0, 120));
    return json({ ok: false, error: 'Could not save that. Try again.' }, 500);
  }
}

const ID_RE = /^[A-Za-z0-9_-]{6,128}$/;

/** The entry's reference, only when it exists and belongs to this owner. Otherwise null. */
async function ownedRef(db, uid, id) {
  if (!ID_RE.test(String(id || ''))) return null;
  const ref = doc(db, 'deal_activity', String(id));
  const snap = await getDoc(ref);
  return snap.exists() && snap.data().userId === uid ? ref : null;
}

export async function PATCH(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Send the change as JSON.' }, 400); }
  const r = cleanEdit(body);
  if (r.error) return json({ ok: false, error: r.error }, 400);
  try {
    const ref = await ownedRef(db, who.uid, body.id);
    if (!ref) return json({ ok: false, error: 'That entry was not found.' }, 404);
    await updateDoc(ref, { ...r.value, editedAt: new Date().toISOString() });
    return json({ ok: true });
  } catch (e) {
    console.error('[deal-activity] edit failed:', String(e?.message || '').slice(0, 120));
    return json({ ok: false, error: 'Could not save that. Try again.' }, 500);
  }
}

export async function DELETE(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const id = new URL(request.url).searchParams.get('id');
  try {
    const ref = await ownedRef(db, who.uid, id);
    if (!ref) return json({ ok: false, error: 'That entry was not found.' }, 404);
    await deleteDoc(ref);
    return json({ ok: true });
  } catch (e) {
    console.error('[deal-activity] delete failed:', String(e?.message || '').slice(0, 120));
    return json({ ok: false, error: 'Could not delete that. Try again.' }, 500);
  }
}
