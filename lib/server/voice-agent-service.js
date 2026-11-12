// lib/server/voice-agent-service.js - the owner's voice agent: created once, calls started on request, summaries kept on the customer. Never throws.
import { randomBytes } from 'node:crypto';
import { doc, getDoc, collection, addDoc, setDoc } from '../server-firestore.js';
import { secretsFor, writeAccountSecret } from './integration-secrets.js';
import { agentConfig, callBody } from '../voice-agent.js';
import { resolveProfile } from '../business-profile.js';

const API = 'https://api.vapi.ai';

export async function ensureAgent(db, uid, { origin, intakeId, env = process.env, fetchImpl = fetch }) {
  const s = await secretsFor(db, uid, ['VAPI_API_KEY', 'VAPI_PHONE_NUMBER_ID', 'VAPI_WEBHOOK_SECRET'], { env }).catch(() => ({}));
  if (!s.VAPI_API_KEY) return { ok: false, error: 'Add your voice-agent key under Integrations first.' };
  if (!s.VAPI_PHONE_NUMBER_ID) {
    // the phone number on the account is found from the key, so the owner does not paste it
    const list = await fetchImpl(`${API}/phone-number`, { headers: { Authorization: `Bearer ${s.VAPI_API_KEY}` } }).then((r) => (r?.ok ? r.json() : null)).catch(() => null);
    const id = Array.isArray(list) ? list.find((p) => p && p.id)?.id : null;
    if (!id) return { ok: false, error: 'No phone number was found on your voice-agent account. Add one there, then try again.' };
    await writeAccountSecret(db, uid, 'VAPI_PHONE_NUMBER_ID', String(id));
    s.VAPI_PHONE_NUMBER_ID = String(id);
  }
  const settings = (await getDoc(doc(db, 'users', uid, 'settings', 'voice_agent')).catch(() => null))?.data?.() || {};
  if (settings.assistantId) return { ok: true, assistantId: settings.assistantId, phoneNumberId: s.VAPI_PHONE_NUMBER_ID, secret: s.VAPI_WEBHOOK_SECRET };
  const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
  let webhookSecret = s.VAPI_WEBHOOK_SECRET;
  if (!webhookSecret) { webhookSecret = randomBytes(24).toString('base64url'); await writeAccountSecret(db, uid, 'VAPI_WEBHOOK_SECRET', webhookSecret); }
  const profile = resolveProfile(biz);
  const cfg = agentConfig({ businessName: profile.businessName, offer: profile.offer, serverUrl: `${origin}/api/voice-agent/webhook?id=${encodeURIComponent(intakeId)}`, serverSecret: webhookSecret });
  const r = await fetchImpl(`${API}/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.VAPI_API_KEY}` }, body: JSON.stringify(cfg) });
  if (!r?.ok) return { ok: false, error: 'The voice-agent service did not create the assistant. Check the key.' };
  const assistantId = (await r.json()).id;
  if (!assistantId) return { ok: false, error: 'The voice-agent service did not return an assistant.' };
  await setDoc(doc(db, 'users', uid, 'settings', 'voice_agent'), { assistantId, createdAt: new Date().toISOString() }, { merge: true });
  return { ok: true, assistantId, phoneNumberId: s.VAPI_PHONE_NUMBER_ID, secret: webhookSecret };
}

export async function placeAiCall(db, uid, { number, name = '', email = '', origin, intakeId, env = process.env, fetchImpl = fetch }) {
  try {
    const agent = await ensureAgent(db, uid, { origin, intakeId, env, fetchImpl });
    if (!agent.ok) return agent;
    const body = callBody({ assistantId: agent.assistantId, phoneNumberId: agent.phoneNumberId, number, name });
    if (!body) return { ok: false, error: 'Use the number with its country code, for example +447700900000.' };
    const s = await secretsFor(db, uid, ['VAPI_API_KEY'], { env }).catch(() => ({}));
    const r = await fetchImpl(`${API}/call`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.VAPI_API_KEY}` }, body: JSON.stringify(body) });
    if (!r?.ok) return { ok: false, error: 'The call could not be started. Check the key and the phone number.' };
    const call = await r.json();
    await addDoc(collection(db, 'users', uid, 'call_attempts'), { email: String(email).trim().toLowerCase(), phone: body.customer.number, callId: call.id || '', createdAt: new Date().toISOString() });
    return { ok: true, callId: call.id || '' };
  } catch (e) {
    console.error('[voice-agent] call failed:', uid, String(e?.message || '').slice(0, 120));
    return { ok: false, error: 'The call could not be started right now.' };
  }
}

/** Keeps a finished call's summary on the customer, so the next call, the brief and the call list see it. */
export async function keepCallSummary(db, uid, parsed) {
  const email = parsed.phone ? await emailForPhone(db, uid, parsed.phone) : '';
  await addDoc(collection(db, 'users', uid, 'call_notes'), { email, summary: parsed.summary, nextStep: parsed.nextStep, outcome: parsed.outcome, source: 'ai-call', callId: parsed.callId, createdAt: new Date().toISOString() });
  return { ok: true, email };
}

async function emailForPhone(db, uid, phone) {
  const attempts = await import('../server-firestore.js').then((m) => m.getDocs(m.query(m.collection(db, 'users', uid, 'call_attempts'), m.where('phone', '==', phone), m.limit(1)))).catch(() => null);
  return attempts?.docs?.[0]?.data()?.email || '';
}
