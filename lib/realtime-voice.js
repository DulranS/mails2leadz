// lib/realtime-voice.js - the live voice session for the owner's browser: instructions and the request body. Pure.
// The browser talks to the voice service directly with a short-lived key; the server only issues that key.
export const REALTIME_MODEL = process.env.REALTIME_MODEL || 'gpt-realtime';

/** What the voice assistant is for. It answers questions and offers a call; it does not quote prices, promise results or take payment. */
export function liveVoiceInstructions({ businessName = '', offer = '' } = {}) {
  const name = String(businessName || 'the business').replace(/\s+/g, ' ').trim().slice(0, 120);
  const what = String(offer || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  return [
    `You are the voice assistant for ${name}.`,
    what ? `What the business offers: ${what}` : '',
    'Answer questions plainly and briefly. Offer to book a call when the person is interested.',
    'Do not quote prices, promise results or take payment details. If unsure, say you will pass the question on.',
  ].filter(Boolean).join('\n');
}

export function realtimeSessionBody({ instructions, voice = 'alloy', model = REALTIME_MODEL } = {}) {
  return { session: { type: 'realtime', model, instructions, audio: { output: { voice } } } };
}
