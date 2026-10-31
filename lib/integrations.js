// lib/integrations.js - which outside services are connected. Pure: it reads names and presence, never values.
// A service is ready when every key it needs is present for the account, or (self-hosted only) in the server settings.
// In SaaS mode the server settings never count for an account: an account's keys must be its own.
//
// A `need` is a list of groups. Every group must have at least one key present (a group with several names is "any of these").
export const INTEGRATIONS = [
  {
    id: 'gmail', label: 'Gmail: sending and reply checks',
    need: [['NEXT_PUBLIC_GOOGLE_CLIENT_ID'], ['NEXT_PUBLIC_GOOGLE_CLIENT_SECRET']],
    unlocks: 'Sending quotes, follow-ups and invoices from your own mailbox; checking quote replies; the morning brief.',
    automatic: 'Nightly invoices, reminders, reply checks and the quote digest. You connect your own Gmail in Account.',
    consent: 'Sends only from your own mailbox. Outreach carries your opt-out link.',
  },
  {
    id: 'ai', label: 'AI writing (DeepSeek, OpenAI or Anthropic)',
    need: [['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY']],
    unlocks: 'Drafted replies, proposals, call briefs, target finding, content plans.',
    automatic: 'Nightly drafts when the autopilot is on. Drafts wait for your approval before anything is sent.',
    consent: 'AI never sends anything on its own.',
  },
  {
    id: 'twilio_sms', label: 'SMS and calls (Twilio)',
    need: [['TWILIO_ACCOUNT_SID'], ['TWILIO_AUTH_TOKEN'], ['TWILIO_PHONE_NUMBER']],
    unlocks: 'Sending an SMS or placing a call from the CRM.',
    automatic: 'Manual only: each SMS or call is started by you.',
    consent: 'Calls are recorded only if TWILIO_RECORD_CALLS is set, and only where the law allows it.',
  },
  {
    id: 'whatsapp', label: 'WhatsApp templates (Twilio)',
    need: [['TWILIO_ACCOUNT_SID'], ['TWILIO_AUTH_TOKEN'], ['TWILIO_WHATSAPP_FROM'], ['TWILIO_WA_TEMPLATE_QUOTE', 'TWILIO_WA_TEMPLATE_FOLLOWUP', 'TWILIO_WA_TEMPLATE_INVOICE']],
    unlocks: 'Sending a Meta-approved WhatsApp template to a customer.',
    automatic: 'Manual: you press send for each customer.',
    consent: 'Only to customers whose WhatsApp consent you have recorded, and never to opted-out or lost contacts. Templates must be approved by Meta first.',
  },
  {
    id: 'stripe_payments', label: 'Card payments on invoices (Stripe)',
    need: [['STRIPE_PAYMENTS_SECRET_KEY'], ['STRIPE_PAYMENTS_WEBHOOK_SECRET'], ['NEXT_PUBLIC_BASE_URL'], ['PAY_SECRET', 'UNSUBSCRIBE_SECRET', 'WEBHOOK_SECRET']],
    unlocks: 'A pay-by-card link in invoice emails and reminders; a payment marks the invoice paid or part paid.',
    automatic: 'Automatic: nightly invoice emails and overdue reminders include the link.',
    consent: 'Goes into your own Stripe account. Card details never reach the app. The software subscription uses a separate key.',
  },
  {
    id: 'meta_ads', label: 'Meta Ads spend (read-only)',
    need: [['META_ACCESS_TOKEN'], ['META_AD_ACCOUNT_ID']],
    unlocks: 'Importing monthly paid-ads spend into the marketing panel, so cost per win uses real spend.',
    automatic: 'Nightly, once the morning brief is on, and by button. Months you entered by hand are never overwritten.',
    consent: 'Read-only: it reads spend and never changes an ad.',
  },
  {
    id: 'google_ads', label: 'Google Ads spend (read-only)',
    need: [['GOOGLE_ADS_DEVELOPER_TOKEN'], ['GOOGLE_ADS_CLIENT_ID'], ['GOOGLE_ADS_CLIENT_SECRET'], ['GOOGLE_ADS_REFRESH_TOKEN'], ['GOOGLE_ADS_CUSTOMER_ID']],
    unlocks: 'Importing monthly Google Ads spend into the marketing panel, alongside Meta.',
    automatic: 'Nightly, once the morning brief is on, and by button. Months you entered by hand are never overwritten.',
    consent: 'Read-only: it reads spend and never changes a campaign. Needs a Google Ads developer token that Google has approved.',
  },
  {
    id: 'voice_agent', label: 'AI phone assistant (Twilio)',
    need: [['TWILIO_ACCOUNT_SID'], ['TWILIO_AUTH_TOKEN'], ['TWILIO_PHONE_NUMBER'], ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'], ['NEXT_PUBLIC_BASE_URL']],
    unlocks: 'Phone calls made by an AI assistant, turn by turn, for a purpose you write.',
    automatic: 'Only when you start a call. Each call is a short conversation, with a transcript.',
    consent: 'Only to people who agreed to AI calls, inside calling hours, with a daily cap. It says at the start that it is an AI, and it stops the moment someone asks. Check the law where you call before you use it.',
  },
];

/** @param env      server settings (used only when not in SaaS mode)
 *  @param account  per-key presence for this account: { KEY: 'account' | 'server' | '' } (see presenceFor); never values
 *  @returns {{id,label,state:'ready'|'needs_keys'|'not_built',missing:string[],unlocks,automatic,consent,reason?}[]} */
export function integrationStatus(env = {}, { account = {}, saas = false } = {}) {
  const present = (k) => String(env?.[k] ?? '').trim() !== '';
  const has = (k) => account[k] === 'account' || (!saas && present(k));
  return INTEGRATIONS.map((i) => {
    const { need, ...shown } = i;
    if (i.status === 'not_built') return { ...shown, state: 'not_built', missing: [] };
    const missing = (need || []).filter((group) => !group.some(has)).map((group) => group.join(' or '));
    return { ...shown, state: missing.length === 0 ? 'ready' : 'needs_keys', missing };
  });
}
