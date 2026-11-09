// lib/server/twilio-account.js - the Twilio client and sending number for ONE account (its own keys, never the operator's in SaaS mode).
// Used by SMS, phone calls and the AI voice agent.
import twilio from 'twilio';
import { secretsFor, CALL_NAMES, writeAccountSecret } from './integration-secrets.js';

/** @returns {Promise<{client: object, from: string} | null>}  null = this account has no Twilio keys */
export async function twilioFor(db, uid, opts = {}) {
  const s = await secretsFor(db, uid, CALL_NAMES, opts);
  if (!s.TWILIO_ACCOUNT_SID || !s.TWILIO_AUTH_TOKEN) return null;
  const client = twilio(s.TWILIO_ACCOUNT_SID, s.TWILIO_AUTH_TOKEN);
  let from = s.TWILIO_PHONE_NUMBER;
  if (!from) {
    // the account's first number is read from Twilio and kept, so the owner does not type it
    const numbers = await client.incomingPhoneNumbers.list({ limit: 1 }).catch(() => []);
    from = numbers?.[0]?.phoneNumber || '';
    if (!from) return null;
    await writeAccountSecret(db, uid, 'TWILIO_PHONE_NUMBER', from).catch(() => null);
  }
  return { client, from };
}
