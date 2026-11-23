// app/api/assistant/route.js - the owner's sales assistant (v377): saved chats, several per business, titled and kept automatically.
// Read only: it answers from the business's own deals and writes nothing to them. Model calls go through callAI, so the daily call
// cap, the monthly budget and the plan check all apply.
//
// GET                          -> the chat list, newest first
// GET  ?session=<id>           -> one chat's messages, oldest first
// POST {question, sessionId?}  -> an answer. No sessionId starts a new chat, titled by the question. The recent turns of an existing
//                                 chat are read here, so the client never sends a transcript. Nothing is saved unless the answer succeeds.
// DELETE {sessionId}           -> removes a chat and its messages
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, orderBy, limit } from '../../../lib/server-firestore.js';
import { callAI, AiError } from '../../../lib/ai-client.js';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../lib/rate-limit.js';
import {
  sanitizeQuestion, sanitizeHistory, buildPipelineSnapshot, assistantPrompt, ASSISTANT_SYSTEM,
  isChatId, chatTitleFrom, chatPreview, CHAT_LIST_MAX, CHAT_STORED_MAX, ASSISTANT_HISTORY_TURNS,
} from '../../../lib/assistant.js';

export const maxDuration = 45;
const DEALS_READ = 500; // the newest 500 deals are enough for an answer; the snapshot caps its own lists further
const limiter = makeLimiter({ limit: 60, windowMs: 3600000 }); // questions per business per hour, on top of the AI daily and monthly caps
const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: NO_STORE });

const chatPath = (db, uid, id) => doc(db, 'users', uid, 'assistantChats', id);
const msgPath = (db, uid, id, msgId) => doc(db, 'users', uid, 'assistantChats', id, 'messages', msgId);
const msgsCol = (db, uid, id) => collection(db, 'users', uid, 'assistantChats', id, 'messages');

// The newest `max` messages of one chat, returned oldest first.
async function readMessages(db, uid, id, max) {
  const snap = await getDocs(query(msgsCol(db, uid, id), orderBy('createdAt', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
}

async function guard(request) {
  const who = identify(request);
  if (who.response) return { response: who.response };
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return { response: g.response };
  return { db, uid: who.uid };
}

export async function GET(request) {
  const g = await guard(request);
  if (g.response) return g.response;
  const { db, uid } = g;
  const session = new URL(request.url).searchParams.get('session');

  if (session) {
    if (!isChatId(session)) return json({ error: 'That chat was not found.' }, 404);
    const meta = await getDoc(chatPath(db, uid, session));
    if (!meta.exists()) return json({ error: 'That chat was not found.' }, 404);
    const messages = await readMessages(db, uid, session, CHAT_STORED_MAX);
    return json({ session: { id: session, ...meta.data() }, messages });
  }

  const snap = await getDocs(query(collection(db, 'users', uid, 'assistantChats'), orderBy('updatedAt', 'desc'), limit(CHAT_LIST_MAX)));
  return json({ sessions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the question as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const gate = limiter.hit(who.uid);
  if (!gate.ok) return json({ error: 'Too many questions for now. Try again in a few minutes.' }, 429);

  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const uid = who.uid;

  const question = sanitizeQuestion(body?.question);
  if (!question) return json({ error: 'Type a question first.' }, 400);

  // An existing chat keeps its own title and history. No sessionId starts a new chat with a fresh id.
  let existing = null;
  let chatId = null;
  if (body?.sessionId != null && body.sessionId !== '') {
    if (!isChatId(body.sessionId)) return json({ error: 'That chat was not found.' }, 404);
    const meta = await getDoc(chatPath(db, uid, body.sessionId));
    if (!meta.exists()) return json({ error: 'That chat was not found.' }, 404);
    existing = meta.data();
    chatId = body.sessionId;
  }
  const history = chatId
    ? sanitizeHistory((await readMessages(db, uid, chatId, ASSISTANT_HISTORY_TURNS * 2)).map((m) => ({ role: m.role, text: m.text })))
    : [];

  const dealsSnap = await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(DEALS_READ)));
  const snapshot = buildPipelineSnapshot(dealsSnap.docs.map((d) => d.data()));

  let r;
  try {
    r = await callAI({
      uid,
      feature: 'assistant',
      tier: 'fast',
      system: ASSISTANT_SYSTEM,
      prompt: assistantPrompt(question, snapshot, history),
      maxTokens: 500,
      json: false,
    });
  } catch (e) {
    if (e instanceof AiError) return json({ error: e.message, code: e.code }, e.status || 502);
    throw e;
  }

  const answer = String(r.text || '').trim() || 'No answer came back. Try asking again.';
  const now = Date.now();
  const id = chatId || randomUUID();
  const title = existing?.title || chatTitleFrom(question);

  await setDoc(chatPath(db, uid, id), {
    title,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastPreview: chatPreview(answer),
  }, { merge: true });
  await setDoc(msgPath(db, uid, id, randomUUID()), { role: 'owner', text: question, createdAt: now });
  await setDoc(msgPath(db, uid, id, randomUUID()), { role: 'assistant', text: answer, createdAt: now + 1 });

  return json({ sessionId: id, title, answer, cached: !!r.cached, created: !chatId });
}

export async function DELETE(request) {
  const g = await guard(request);
  if (g.response) return g.response;
  const { db, uid } = g;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the chat id as JSON.' }, 400); }
  if (!isChatId(body?.sessionId)) return json({ error: 'That chat was not found.' }, 404);
  const messages = await readMessages(db, uid, body.sessionId, CHAT_STORED_MAX * 5);
  for (const m of messages) await deleteDoc(msgPath(db, uid, body.sessionId, m.id));
  await deleteDoc(chatPath(db, uid, body.sessionId));
  return json({ ok: true });
}
