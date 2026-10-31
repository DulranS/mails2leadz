// lib/server/whatsapp.js - WhatsApp through Twilio, using Meta-approved templates only (a business cannot open a WhatsApp
// conversation with free text). Keys come per account (integration-secrets). Nothing is sent unless the customer's consent is
// on record and the contact is not opted out.
import twilio from 'twilio';

export const WA_TEMPLATE_ENV = { quote: 'TWILIO_WA_TEMPLATE_QUOTE', followup: 'TWILIO_WA_TEMPLATE_FOLLOWUP', invoice: 'TWILIO_WA_TEMPLATE_INVOICE' };

/** `secrets` holds the account's values, keyed by their names (TWILIO_ACCOUNT_SID and so on). */
export const whatsappReady = (secrets = {}) => ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'].every((k) => String(secrets[k] || '').trim() !== '');

export const templateSidFor = (kind, secrets = {}) => {
  const k = WA_TEMPLATE_ENV[kind];
  return k ? String(secrets[k] || '').trim() : '';
};

/** The gate in front of every WhatsApp send. Returns { ok: true } or { error } saying exactly what is missing. */
export function canSendWhatsApp({ ready, templateSid, blocked, consent }) {
  if (!ready) return { error: 'WhatsApp is not connected. Add the Twilio WhatsApp keys first (see Integrations).' };
  if (!templateSid) return { error: 'No approved WhatsApp template is set for this kind of message.' };
  if (blocked) return { error: 'This customer has opted out, or their deal is lost. Nothing was sent.' };
  if (!consent || consent.consent !== true) return { error: "Record the customer's WhatsApp consent first. Nothing is sent without it." };
  if (!consent.phone) return { error: 'The consent record has no phone number.' };
  return { ok: true };
}

export async function sendWhatsAppTemplate({ to, templateSid, variables = {}, secrets = {} }) {
  const client = twilio(secrets.TWILIO_ACCOUNT_SID, secrets.TWILIO_AUTH_TOKEN);
  return client.messages.create({
    from: `whatsapp:${secrets.TWILIO_WHATSAPP_FROM}`,
    to: `whatsapp:${to}`,
    contentSid: templateSid,
    contentVariables: JSON.stringify(variables),
  });
}
