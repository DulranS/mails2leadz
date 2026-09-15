const crypto = require('crypto');

function getSecret() {
  const secret = process.env.UNSUB_SECRET;
  if (!secret) throw new Error('Missing UNSUB_SECRET in .env.local');
  return secret;
}

/**
 * Produces a short signed token for a lead so the unsubscribe link in an
 * email can prove it wasn't tampered with, without storing a token in the
 * database or calling any external service — it's just an HMAC of the
 * lead id, verified the same way on the way back in.
 */
function generateUnsubscribeToken(leadId) {
  return crypto.createHmac('sha256', getSecret()).update(leadId).digest('hex').slice(0, 32);
}

function verifyUnsubscribeToken(leadId, token) {
  const expected = generateUnsubscribeToken(leadId);
  // Constant-time comparison — avoids leaking the valid token via timing.
  return (
    expected.length === token?.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))
  );
}

function unsubscribeUrl(baseUrl, leadId) {
  const token = generateUnsubscribeToken(leadId);
  return `${baseUrl}/api/unsubscribe?lead=${leadId}&token=${token}`;
}

module.exports = { generateUnsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl };
