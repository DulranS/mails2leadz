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

// What the customer must have agreed to receive (pass 339). A quote or invoice is about their own order, so "replies and updates" covers it.
// A follow-up is a sales message, so it needs marketing consent. A record with no purpose (kept from before pass 338) covers neither:
// the owner re-records it, once, and the message goes.
export const WA_KIND_PURPOSE = { quote: 'replies_and_updates', invoice: 'replies_and_updates', followup: 'marketing' };
const PURPOSE_COVERS = { marketing: ['replies_and_updates', 'marketing'], replies_and_updates: ['replies_and_updates'] };

/** The gate in front of every WhatsApp send. Returns { ok: true } or { error } saying exactly what is missing. */
export function canSendWhatsApp({ ready, templateSid, blocked, consent, kind }) {
  if (!ready) return { error: 'WhatsApp is not connected. Add the Twilio WhatsApp keys first (see Integrations).' };
  if (!templateSid) return { error: 'No approved WhatsApp template is set for this kind of message.' };
  if (blocked) return { error: 'This customer has opted out, or their deal is lost. Nothing was sent.' };
  if (!consent || consent.consent !== true) return { error: "Record the customer's WhatsApp consent first. Nothing is sent without it." };
  if (!consent.phone) return { error: 'The consent record has no phone number.' };
  const need = WA_KIND_PURPOSE[kind];
  if (need) {
    const covers = PURPOSE_COVERS[consent.purpose] || [];
    if (!covers.includes(need)) {
      return { error: need === 'marketing'
        ? 'This customer agreed to replies and updates only. A follow-up is a sales message: record marketing consent first.'
        : 'Record what this customer agreed to receive (replies and updates, or marketing) on the Integrations page first.' };
    }
  }
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
