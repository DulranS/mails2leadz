const twilio = require('twilio');

function getClient() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error('Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN in .env.local');
  }
  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

/**
 * Sends a WhatsApp message via Twilio's WhatsApp API.
 * `to` must be E.164 format, e.g. +94771234567.
 * Requires TWILIO_WHATSAPP_NUMBER to be an approved Twilio WhatsApp sender
 * (sandbox number for testing, a registered business number for production).
 */
async function sendWhatsApp({ to, body }) {
  const client = getClient();
  const from = process.env.TWILIO_WHATSAPP_NUMBER;
  if (!from) throw new Error('Missing TWILIO_WHATSAPP_NUMBER in .env.local');

  const msg = await client.messages.create({
    from: `whatsapp:${from}`,
    to: `whatsapp:${to}`,
    body,
  });

  return { messageId: msg.sid, status: msg.status };
}

module.exports = { sendWhatsApp };
