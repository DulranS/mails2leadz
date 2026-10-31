// lib/server/twilio-account.js - the Twilio client and sending number for ONE account (its own keys, never the operator's in SaaS mode).
// Used by SMS, phone calls and the AI voice agent.
import twilio from 'twilio';
import { secretsFor, CALL_NAMES } from './integration-secrets.js';

/** @returns {Promise<{client: object, from: string} | null>}  null = this account has no Twilio keys */
export async function twilioFor(db, uid, opts = {}) {
  const s = await secretsFor(db, uid, CALL_NAMES, opts);
  if (!s.TWILIO_ACCOUNT_SID || !s.TWILIO_AUTH_TOKEN || !s.TWILIO_PHONE_NUMBER) return null;
  return { client: twilio(s.TWILIO_ACCOUNT_SID, s.TWILIO_AUTH_TOKEN), from: s.TWILIO_PHONE_NUMBER };
}
