// lib/channel-drafts.js - short WhatsApp and SMS drafts, and call briefs. Pure: no network. The owner opens each draft in their own app and presses send.
// Nothing here sends a message or places a call, so there is no channel API, no per-message cost and no bulk-sending rule to meet.
export const CHANNEL_KINDS = ['whatsapp', 'sms', 'call_brief'];

const SYSTEM = {
  whatsapp: 'You write a short, friendly WhatsApp message (two or three sentences, plain text, no links unless one is given) from a small business to someone it is already talking with. One clear next step. Never invent facts, prices or dates.',
  sms: 'You write a short SMS (under 300 characters, plain text) from a small business to someone it is already talking with. One clear next step. Never invent facts, prices or dates.',
  call_brief: 'You write a call brief for the owner before a phone call with this prospect. Four short lines: where they are in the process, what they have said or care about, the most likely objection with a calm reply, and one opening sentence. Write "not recorded" wherever the notes do not say. Never invent facts.',
};

/** The system and user prompts for one channel draft. Throws for an unknown channel. */
export function channelMessages({ kind, offer = '', company = '', stage = '', note = '' }) {
  if (!CHANNEL_KINDS.includes(kind)) throw new Error('UNKNOWN_CHANNEL');
  const system = `${SYSTEM[kind]}\nReturn JSON only: {"text": string}.`;
  const prompt = [
    offer ? `What we sell: ${String(offer).slice(0, 600)}` : 'What we sell: not described yet.',
    `Business: ${String(company || 'unknown').slice(0, 120)}`,
    `Deal stage: ${String(stage || 'not set').slice(0, 40)}`,
    `Notes so far: ${String(note || 'none recorded').slice(0, 800)}`,
  ].join('\n');
  return { system, prompt };
}

/** Digits only, or '' if there are not enough digits to be a phone number. */
export function digitsOf(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length >= 8 ? d : '';
}

/** A WhatsApp link with the text filled in. Needs the number with its country code. */
export function whatsappLink(phone, text) {
  const d = digitsOf(phone);
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(String(text || ''))}` : '';
}

/** An SMS link with the text filled in. Needs the number with its country code. */
export function smsLink(phone, text) {
  const d = digitsOf(phone);
  return d ? `sms:+${d}?body=${encodeURIComponent(String(text || ''))}` : '';
}
