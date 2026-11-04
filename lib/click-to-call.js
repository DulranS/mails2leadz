// lib/click-to-call.js - click-to-call: the owner's phone rings first; when they answer, the lead is dialled and the two are joined.
// Pure: number checks and the TwiML. The call itself is placed in app/api/calls/click/route.js with the owner's own Twilio account.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

/** A phone number as +digits (8 to 15 digits), or null. Spaces, dashes and brackets are removed first. */
export function e164(input) {
  const raw = String(input || '').replace(/[\s\-().]/g, '');
  const m = raw.match(/^\+?(\d{8,15})$/);
  return m ? `+${m[1]}` : null;
}

/** TwiML that runs when the owner answers: dial the lead, showing the business's own number as caller ID. */
export function clickToCallTwiml(leadPhone, callerId) {
  const lead = e164(leadPhone);
  const from = e164(callerId);
  if (!lead || !from) return null;
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${esc(from)}">${esc(lead)}</Dial></Response>`;
}
