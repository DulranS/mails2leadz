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
import { identify, getDb, NO_STORE, actorFromRequest } from '../../../lib/server/route-helpers.js';
import { recordAudit } from '../../../lib/server/audit.js';
import { buildDealWrite, dealDocId, isClosed } from '../../../lib/deal-utils.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../lib/rate-limit.js';
import {
  sanitizeQuestion, sanitizeHistory, buildPipelineSnapshot, assistantPrompt, ASSISTANT_SYSTEM,
  isChatId, chatTitleFrom, chatPreview, CHAT_LIST_MAX, CHAT_STORED_MAX, ASSISTANT_HISTORY_TURNS,
  validateActions, readReply,
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
      maxTokens: 700,
      json: true,
    });
  } catch (e) {
    if (e instanceof AiError) return json({ error: e.message, code: e.code }, e.status || 502);
    throw e;
  }

  // The reply is JSON: the answer text and any changes it proposes. Every proposed change is checked against the deals this business has.
  const knownEmails = new Set(dealsSnap.docs.map((d) => String(d.data().email || '').trim().toLowerCase()).filter(Boolean));
  const reply = readReply(r.data, r.text);
  const checked = validateActions(reply.actions, knownEmails);
  const answer = reply.answer;
  const rejected = checked.rejected;
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
  // Each proposed change gets its own id and waits for the owner's Confirm (PATCH below).
  const messageId = randomUUID();
  const stored = checked.actions.map((a) => ({ ...a, id: randomUUID(), status: 'proposed' }));
  await setDoc(msgPath(db, uid, id, messageId), { role: 'assistant', text: answer, createdAt: now + 1, ...(stored.length ? { actions: stored } : {}) });

  return json({ sessionId: id, title, answer, messageId, actions: stored, rejected, cached: !!r.cached, created: !chatId });
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

// Confirm or reject one proposed change (v381). The change is checked again here against the deal as it is now.
// Nothing is applied unless the owner confirms, and a change to a closed (won or lost) deal is always refused.
export async function PATCH(request) {
  const g = await guard(request);
  if (g.response) return g.response;
  const { db, uid } = g;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the decision as JSON.' }, 400); }
  const { sessionId, messageId, actionId, decision } = body || {};
  if (!isChatId(sessionId) || !isChatId(messageId) || !isChatId(actionId)) return json({ error: 'That change was not found.' }, 404);
  if (decision !== 'confirm' && decision !== 'reject') return json({ error: 'Choose confirm or reject.' }, 400);

  const msgRef = msgPath(db, uid, sessionId, messageId);
  const msgSnap = await getDoc(msgRef);
  if (!msgSnap.exists()) return json({ error: 'That change was not found.' }, 404);
  const actions = Array.isArray(msgSnap.data().actions) ? msgSnap.data().actions : [];
  const idx = actions.findIndex((a) => a?.id === actionId);
  if (idx < 0) return json({ error: 'That change was not found.' }, 404);
  const current = actions[idx];
  if (current.status !== 'proposed') return json({ error: 'This change was already handled.', action: current }, 409);

  const now = new Date().toISOString();
  let next;
  if (decision === 'reject') {
    next = { ...current, status: 'rejected', decidedAt: now };
  } else {
    const recheck = validateActions(
      [{ type: current.type, email: current.email, stage: current.stage, value: current.value, text: current.text }],
      new Set([String(current.email || '').toLowerCase()]),
    );
    const dealRef = doc(db, 'deals', dealDocId(uid, current.email));
    const dealSnap = await getDoc(dealRef);
    if (recheck.actions.length === 0) {
      next = { ...current, status: 'failed', reason: recheck.rejected[0] || 'That change is no longer allowed.', decidedAt: now };
    } else if (!dealSnap.exists()) {
      next = { ...current, status: 'failed', reason: 'That deal no longer exists.', decidedAt: now };
    } else {
      const existing = dealSnap.data();
      if (isClosed(existing.stage) && current.type !== 'add_note') {
        next = { ...current, status: 'failed', reason: 'That deal is closed. Reopen it in the app first.', decidedAt: now };
      } else {
        if (current.type === 'set_stage') {
          await setDoc(dealRef, buildDealWrite({ uid, email: current.email, existing, stage: current.stage, now: new Date() }), { merge: true });
        } else if (current.type === 'set_value') {
          await setDoc(dealRef, buildDealWrite({ uid, email: current.email, existing, stage: existing.stage, value: current.value, now: new Date() }), { merge: true });
        } else {
          const notes = Array.isArray(existing.notes) ? existing.notes : [];
          await setDoc(dealRef, { notes: [...notes, { text: current.text, timestamp: now, type: 'manual', addedBy: 'AI assistant, confirmed by the owner' }], lastUpdate: now }, { merge: true });
        }
        next = { ...current, status: 'done', decidedAt: now };
        const what = current.type === 'set_stage' ? 'stage' : current.type === 'set_value' ? 'value' : 'note';
        await recordAudit(db, uid, { action: 'assistant.applied', actorUid: actorFromRequest(request).uid, summary: `Assistant change confirmed: ${what}` });
      }
    }
  }

  await setDoc(msgRef, { actions: actions.map((a, i) => (i === idx ? next : a)) }, { merge: true });
  return json({ action: next });
}
