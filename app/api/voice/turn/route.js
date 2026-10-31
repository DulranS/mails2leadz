// app/api/voice/turn/route.js - PUBLIC (listed in proxy.js). Twilio calls this for every turn of an AI call. The signed token in the
// URL is the only proof of who the call is for. Each reply is one AI sentence or two, spoken back; "stop" is honoured at once.
import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/server/route-helpers.js';
import { getDoc, updateDoc, doc, getDocs, collection, query, where } from '../../../../lib/server-firestore.js';
import { normalizePhone } from '../../../../lib/phone.js';
import { callAI } from '../../../../lib/ai-client.js';
import { suppressContact } from '../../../../lib/server/suppress.js';
import {
  verifyVoiceToken, buildTwiml, wantsStop, systemPromptFor, greetingFor, fallbackLine, stopLine, endLine, MAX_TURNS,
} from '../../../../lib/server/voice-agent.js';

/** Withdraws AI-call consent for a phone number (used when an inbound caller asks not to be called). */
async function withdrawVoiceByPhone(db, uid, phone) {
  const p = normalizePhone(phone) || phone;
  const snap = await getDocs(query(collection(db, 'users', uid, 'voice_consent'), where('phone', '==', p))).catch(() => null);
  for (const d of snap?.docs || []) await updateDoc(d.ref, { consent: false, withdrawnAt: new Date().toISOString(), withdrawnBy: 'voice-stop' }).catch(() => {});
}

const xml = (body, status = 200) => new NextResponse(body, { status, headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
const hangup = (say, status = 200) => xml(buildTwiml({ say, hangup: true }), status);
const transcript = (turns) => turns.slice(-12).map((t) => `${t.role === 'caller' ? 'Person' : 'Assistant'}: ${t.text}`).join('\n');

export async function POST(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('t') || '';
  const who = verifyVoiceToken(token);
  if (!who) return hangup('Sorry, this call cannot continue. Goodbye.', 403);
  const db = getDb();
  const ref = doc(db, 'voice_calls', who.callId);
  let snap;
  try { snap = await getDoc(ref); } catch { return hangup('Sorry, we cannot continue this call right now. Goodbye.', 500); }
  if (!snap.exists() || snap.data().userId !== who.uid) return hangup('Sorry, this call cannot continue. Goodbye.', 404);
  const call = snap.data();
  const business = call.business || 'the business';
  if (call.ended) return hangup(endLine(business));

  const form = await request.formData().catch(() => null);
  const heard = String(form?.get('SpeechResult') || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const turnUrl = `${url.origin}/api/voice/turn?t=${encodeURIComponent(token)}`;
  const turns = Array.isArray(call.turns) ? call.turns : [];

  const end = async (reason, line, nextTurns = turns) => {
    await updateDoc(ref, { turns: nextTurns, ended: true, status: 'ended', endReason: reason, endedAt: new Date().toISOString() }).catch(() => {});
    return hangup(line);
  };

  if (!heard && turns.length === 0) {
    const say = greetingFor({ business, purpose: call.purpose, recorded: call.recorded !== false });
    await updateDoc(ref, { status: 'in_progress', turns: [{ role: 'assistant', text: say }] }).catch(() => {});
    return xml(buildTwiml({ say, gatherAction: turnUrl }));
  }
  if (!heard) return end('no_answer', endLine(business));

  const next = [...turns, { role: 'caller', text: heard }];
  if (wantsStop(heard)) {
    if (call.email) await suppressContact(db, { uid: who.uid, email: call.email, reason: 'unsubscribed', source: 'voice_call' }).catch(() => {});
    else if (call.phone) await withdrawVoiceByPhone(db, who.uid, call.phone); // an inbound caller is not in the email list
    return end('opted_out', stopLine(business), next);
  }
  if (next.filter((t) => t.role === 'caller').length >= MAX_TURNS) return end('max_turns', endLine(business), next);

  let reply = '';
  try {
    const ai = await callAI({
      uid: who.uid, feature: 'voice_turn', tier: 'fast', maxTokens: 120, json: false,
      system: systemPromptFor({ business, purpose: call.purpose }),
      prompt: `Conversation so far:\n${transcript(next)}\n\nReply with the next thing to say.`,
    });
    reply = String(ai?.text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  } catch (e) {
    console.error('[voice turn] AI failed:', String(e?.message || '').slice(0, 120));
  }
  if (!reply) return end('ai_unavailable', fallbackLine(business), next);

  const withReply = [...next, { role: 'assistant', text: reply }];
  await updateDoc(ref, { turns: withReply }).catch(() => {});
  return xml(buildTwiml({ say: reply, gatherAction: turnUrl }));
}
