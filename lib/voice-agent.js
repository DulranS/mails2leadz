// lib/voice-agent.js - real-time phone conversations through a voice-agent service (Vapi), by key. Pure: the agent, the call and the summary check.
// The service keeps the call connected; this app only configures the agent, starts calls and takes the summaries back.
// Field names follow Vapi's documented API as known at writing; check them against Vapi's current reference before relying on them.
import { timingSafeEqual } from 'node:crypto';

export const VOICE_RULES = 'Do not quote prices, promise results or take payment details. If the person asks for something you cannot answer, say you will pass it on and offer a call back. Keep the call short and polite. Stop when the person asks to stop.';

export function agentConfig({ businessName = '', offer = '', goal = 'book a short call or answer questions', serverUrl = '', serverSecret = '' } = {}) {
  const name = String(businessName || 'the business').replace(/\s+/g, ' ').trim().slice(0, 120);
  const what = String(offer || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  return {
    name: `${name} - sales assistant`.slice(0, 80),
    firstMessage: `Hello, this is the assistant for ${name}. Is this a good time to talk for a minute?`,
    model: { provider: 'openai', model: 'gpt-4o-mini', messages: [{ role: 'system', content: [`You are the phone assistant for ${name}.`, what ? `What the business offers: ${what}` : '', `Your goal: ${goal}.`, VOICE_RULES].filter(Boolean).join('\n') }] },
    voice: { provider: 'openai', voiceId: 'alloy' },
    server: { url: serverUrl, secret: serverSecret },
    serverMessages: ['end-of-call-report'],
  };
}

export function callBody({ assistantId, phoneNumberId, number, name = '' }) {
  const n = String(number || '').replace(/[\s\-().]/g, '');
  if (!/^\+\d{8,15}$/.test(n)) return null;
  return { assistantId, phoneNumberId, customer: { number: n, name: String(name || '').slice(0, 80) } };
}

/** The webhook's shared secret, compared in constant time. */
export function webhookAllowed(headerValue, secret) {
  if (!secret || typeof headerValue !== 'string') return false;
  const a = Buffer.from(headerValue), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** From the end-of-call report, the parts the owner keeps: summary, next step, outcome, and the number called. */
export function parseEndOfCall(body) {
  const msg = body?.message;
  if (!msg || msg.type !== 'end-of-call-report') return null;
  const call = msg.call || {};
  const summary = String(msg.summary || msg.analysis?.summary || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const phone = String(call.customer?.number || '').replace(/[\s\-().]/g, '');
  return {
    callId: String(call.id || '').slice(0, 80),
    phone,
    endedReason: String(msg.endedReason || '').slice(0, 80),
    summary: summary || 'The call ended with no summary.',
    nextStep: String(msg.analysis?.structuredData?.nextStep || '').slice(0, 200),
    transcript: String(msg.transcript || '').slice(0, 4000),
    outcome: String(msg.analysis?.successEvaluation || '').slice(0, 40),
  };
}
