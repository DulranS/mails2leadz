// app/api/chat/route.js - PUBLIC website chat. A visitor on the owner's site asks a question; the answer comes only from the
// owner's public business description (lib/chat-rules.js). Nothing the visitor types is stored. Authenticates with the owner's
// write-only enquiry key, like /api/inbound. Contact details go through /api/inbound, not here.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { getDoc, setDoc, doc, isAdminMode } from '../../../lib/server-firestore.js';
import { ownerFromKey } from '../../../lib/server/owner-key.js';
import { getBusinessProfile, callAI, AiError } from '../../../lib/ai-client.js';
import { getEntitlement } from '../../../lib/server/tenant.js';
import { featureAllowed } from '../../../lib/tenant.js';
import { chatFacts, sanitizeChat, chatPrompt, parseChatReply, chatDailyAllowed, CHAT_PER_VISITOR_PER_HOUR, CHAT_FALLBACK } from '../../../lib/chat-rules.js';

export const maxDuration = 30;

const CORS = {
  'Access-Control-Allow-Origin': '*', // the key is write-only and public by design; the page that embeds the chat can be on any site
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Inbound-Key',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
};
const out = (status, body) => NextResponse.json(body, { status, headers: { ...CORS, ...NO_STORE } });

const hits = new Map();
function tooMany(id, limit) {
  const now = Date.now();
  const arr = (hits.get(id) || []).filter((t) => now - t < 3600000);
  if (arr.length >= limit) { hits.set(id, arr); return true; }
  arr.push(now);
  hits.set(id, arr);
  if (hits.size > 5000) hits.clear();
  return false;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request) {
  try {
    if (!isAdminMode()) return out(503, { reply: CHAT_FALLBACK, wants_contact: true });
    let body;
    try { body = await request.json(); } catch { return out(400, { error: 'Send the message as JSON.' }); }

    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    if (tooMany(`chat-ip:${ip}`, CHAT_PER_VISITOR_PER_HOUR)) return out(429, { error: 'Too many messages. Please try again later.' });

    const db = getDb();
    const uid = await ownerFromKey(db, body?.k || request.headers.get('x-inbound-key'));
    if (!uid) return out(401, { error: 'This chat is not active.' });
    const ent = await getEntitlement(db, uid);
    if (ent.mode === 'suspended' || !featureAllowed(ent, 'inbound')) return out(503, { reply: CHAT_FALLBACK, wants_contact: true });

    const s = sanitizeChat(body);
    if (!s.ok) return out(400, { error: s.error });

    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const capRef = doc(db, 'users', uid, 'chat_usage', day);
    const usage = await getDoc(capRef);
    const count = usage.exists() ? Number(usage.data().count) || 0 : 0;
    if (!chatDailyAllowed(count)) return out(429, { reply: 'This chat has reached its limit for today. Leave your details and the team will reply.', wants_contact: true });

    const facts = chatFacts(await getBusinessProfile(uid));
    if (!facts.businessName && !facts.offer) return out(200, { reply: 'Thanks for asking. Leave your details and the team will reply.', wants_contact: true });

    const { system, prompt } = chatPrompt({ facts, history: s.history, message: s.message });
    const r = await callAI({ uid, feature: 'public_chat', tier: 'fast', system, prompt, maxTokens: 250, json: true });
    // Count only answered questions. Only the count is written, never the text.
    await setDoc(capRef, { count: count + 1, day, userId: uid, updatedAt: new Date().toISOString() }, { merge: true });
    const { reply, wantsContact } = parseChatReply(r.text);
    return out(200, { reply, wants_contact: wantsContact });
  } catch (err) {
    if (err instanceof AiError) return out(503, { reply: CHAT_FALLBACK, wants_contact: true });
    console.error('chat error:', err?.message);
    return out(500, { reply: CHAT_FALLBACK, wants_contact: true });
  }
}
