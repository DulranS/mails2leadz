// app/api/notices/route.js - "while you were away" notices written by the unattended reply check (signed-in owner only).
//   GET -> unseen notices, newest first.   POST { action: 'seen', ids } -> dismiss.
import { NextResponse } from 'next/server';
import { collection, doc, getDocs, query, where, setDoc, isAdminMode } from '../../../lib/server-firestore.js';
import { getDb, uidFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';

const reply = (status, body) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  if (!isAdminMode()) return reply(200, { notices: [] });
  const snap = await getDocs(query(collection(getDb(), 'reply_notices'), where('userId', '==', uid), where('seen', '==', false)));
  const notices = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5)
    .map(({ id, type, createdAt, replies, lines, autoReplies }) => ({ id, type, createdAt, replies: replies || 0, lines: lines || [], autoReplies: autoReplies || 0 }));
  return reply(200, { notices });
}

export async function POST(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  if (!isAdminMode()) return reply(503, { error: 'Not available.' });
  const body = await request.json().catch(() => ({}));
  if (body.action !== 'seen') return reply(400, { error: 'Unknown action.' });
  for (const id of (Array.isArray(body.ids) ? body.ids : []).slice(0, 20)) {
    if (typeof id !== 'string' || !id.startsWith(`${uid}_`)) continue; // only this owner's notices
    await setDoc(doc(getDb(), 'reply_notices', id), { seen: true }, { merge: true }).catch(() => {});
  }
  return reply(200, { success: true });
}
