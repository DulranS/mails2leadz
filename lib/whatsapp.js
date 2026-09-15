const twilio = require('twilio');

function getClient(credentials) {
  const { accountSid, authToken } = credentials;
  if (!accountSid || !authToken) {
    throw new Error('This account has no Twilio credentials set — add them in Settings.');
  }
  return twilio(accountSid, authToken);
}

/**
 * Sends a WhatsApp message using ONE account's own Twilio credentials.
 * `credentials`: { accountSid, authToken, whatsappNumber }
 * `to` must be E.164 format, e.g. +94771234567.
 */
async function sendWhatsApp(credentials, { to, body }) {
  const client = getClient(credentials);
  const from = credentials.whatsappNumber;
  if (!from) throw new Error('This account has no Twilio WhatsApp number set — add it in Settings.');

  const msg = await client.messages.create({
    from: `whatsapp:${from}`,
    to: `whatsapp:${to}`,
    body,
  });

  return { messageId: msg.sid, status: msg.status };
}

module.exports = { sendWhatsApp };
