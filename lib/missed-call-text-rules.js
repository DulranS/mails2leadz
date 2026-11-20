// Missed-call text-back rules (pass 341). Pure: no imports, so the tests run without Firebase or Twilio installed.
// The sending code is in lib/server/missed-call-reply.js and uses these rules.
export const TEXT_BACK_WINDOW_MS = 24 * 60 * 60 * 1000;
export const validCallerNumber = (from) => /^\+\d{8,15}$/.test(String(from || '').trim());

// Why a text is not sent, or null when it should be.
export function textBackRefusal({ from, lastSentAt, now, paused }) {
  if (paused) return 'The owner has paused automations in settings, so no text was sent.';
  if (!validCallerNumber(from)) return 'The caller number is not a full international number.';
  if (lastSentAt && now - Date.parse(lastSentAt) < TEXT_BACK_WINDOW_MS) return 'This caller was already texted in the last 24 hours.';
  return null;
}

export function textBackBody(businessName) {
  const name = String(businessName || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 40);
  return `Sorry we missed your call${name ? ` at ${name}` : ''}. Reply here and we will get back to you. Reply STOP to opt out.`;
}
