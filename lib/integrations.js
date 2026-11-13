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
    id: 'meta_leads', label: 'Meta Lead Ads (Facebook and Instagram lead forms)',
    need: [['META_APP_SECRET'], ['META_VERIFY_TOKEN'], ['META_PAGE_ACCESS_TOKEN'], ['META_PAGE_ID'], ['META_OWNER_UID']],
    unlocks: 'New leads from your Meta lead forms arrive in the inbox within minutes, with their name, email, phone and company.',
    automatic: 'Each new form lead is stored as new in the inbox. Nothing is sent to the lead.',
    consent: 'The lead gave their details to the form. Outreach still goes through your review and your opt-out link.',
  },
  {
    id: 'google_leads', label: 'Google Ads lead forms',
    need: [['GOOGLE_ADS_LEAD_KEY'], ['GOOGLE_ADS_OWNER_UID']],
    unlocks: 'New leads from your Google Ads lead forms arrive in the inbox, with their name, email, phone and company.',
    automatic: 'Each new form lead is stored as new in the inbox. Nothing is sent to the lead.',
    consent: 'The lead gave their details to the form. Outreach still goes through your review and your opt-out link.',
  },
  {
    id: 'typeform', label: 'Typeform (lead forms)',
    need: [['TYPEFORM_WEBHOOK_SECRET'], ['FORMS_OWNER_UID']],
    unlocks: 'Typeform submissions arrive in the inbox with their email, name, company and phone.',
    automatic: 'Each submission is stored as new in the inbox. Nothing is sent to the person.',
    consent: 'The person gave their details to the form. Outreach still goes through your review and opt-out link.',
  },
  {
    id: 'tally', label: 'Tally (lead forms)',
    need: [['TALLY_SIGNING_SECRET'], ['FORMS_OWNER_UID']],
    unlocks: 'Tally submissions arrive in the inbox with their email, name, company and phone.',
    automatic: 'Each submission is stored as new in the inbox. Nothing is sent to the person.',
    consent: 'The person gave their details to the form. Outreach still goes through your review and opt-out link.',
  },
  {
    id: 'ga4', label: 'Google Analytics 4 conversions (for Google Ads)',
    need: [['GA4_MEASUREMENT_ID'], ['GA4_API_SECRET']],
    unlocks: 'Payments, enquiries, accepted quotes and confirmed bookings are counted in GA4, so Google Ads can optimise on them.',
    automatic: 'Each event is sent once when it happens. Only the event name and value are sent: no customer data.',
    consent: 'No personal data leaves for this. Google Ads counts the events; it does not receive who paid.',
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
    id: 'contact_lookup', label: 'Company contact lookup (Hunter)',
    need: [['HUNTER_API_KEY']],
    unlocks: 'Finding public business contacts at a company domain, to choose who to contact.',
    automatic: 'Manual: you run each lookup. Nothing is saved or sent by the lookup.',
    consent: 'Each lookup uses your own Hunter credits. Use the contacts only as the law where you are allows.',
  },
  {
    id: 'enrichment', label: 'Lead enrichment (Apollo or People Data Labs)',
    need: [['APOLLO_API_KEY', 'PDL_API_KEY']],
    unlocks: 'Company, role and contact details added to your leads from one key, so each lead is complete before you reach out.',
    automatic: 'Runs as leads arrive and when you open a lead.',
    consent: 'Uses public business data. Check your own rules before contacting anyone you find.',
  },
  {
    id: 'google_places', label: 'Google Maps: automatic lead search (Places)',
    need: [['GOOGLE_PLACES_API_KEY']],
    unlocks: 'Local businesses found weekly for the search words you save, added to your lead list.',
    automatic: 'Searched each week. Found businesses are contacted only under your own consent and opt-out rules.',
    consent: 'An official Google API. Phone and website details can carry a higher Google billing tier; check Google\'s pricing.',
  },
  {
    id: 'dropbox_sign', label: 'Electronic signature (Dropbox Sign)',
    need: [['DROPBOX_SIGN_API_KEY']],
    unlocks: 'Sending an agreement for electronic signature, with the signature and date placed in the document.',
    automatic: 'Each request is checked daily until it is signed.',
    consent: 'The signer receives the agreement by email only. Test sends are not legally binding.',
  },
  {
    id: 'companies_house', label: 'Company search and checks (Companies House, UK)',
    need: [['COMPANIES_HOUSE_API_KEY']],
    unlocks: 'Searching UK companies and checking their public records for buy-side deals.',
    automatic: 'A weekly re-check of the companies you track; only new red flags are reported.',
    consent: 'Public company records only. Nothing is sent to the companies.',
  },
  {
    id: 'shopify', label: 'Shopify store (product listings)',
    need: [['SHOPIFY_STORE_DOMAIN'], ['SHOPIFY_ACCESS_TOKEN']],
    unlocks: 'Your products sent to your own Shopify store.',
    automatic: 'Changed products are sent each day. Each one is sent once per change.',
    consent: 'Only your own store. The token is only ever sent to a Shopify store domain.',
  },
  {
    id: 'ebay', label: 'eBay seller account (listings and deal search)',
    need: [['EBAY_REFRESH_TOKEN', 'EBAY_USER_TOKEN']],
    unlocks: 'Your products as eBay inventory, and optional live listings with your own policies.',
    automatic: 'Inventory is sent each day; publishing happens only if you switch it on.',
    consent: 'Your own eBay account. Live listings are off until you turn them on.',
  },
  {
    id: 'tiktok_events', label: 'TikTok Events (purchase and sign-up events)',
    need: [['TIKTOK_PIXEL_CODE'], ['TIKTOK_EVENTS_TOKEN']],
    unlocks: 'Sign-up and purchase events for customers who agreed, sent to your TikTok pixel.',
    automatic: 'Sent each day, once per sign-up or payment.',
    consent: 'Only people who confirmed their sign-up. Emails are hashed before they leave the app.',
  },
  {
    id: 'voice_agent_vapi', label: 'AI phone calls (voice service, Vapi)',
    need: [['VAPI_API_KEY']],
    unlocks: 'Real phone conversations with a sales assistant, one tap at a time from your call list.',
    automatic: 'Calls start only when you tap them. Each call ends with a summary on the customer\'s record.',
    consent: 'Only to people you have a lawful basis to call. The assistant says it is an AI. Check the law where you call.',
  },
  {
    id: 'voice_agent', label: 'AI phone assistant (Twilio)',
    need: [['TWILIO_ACCOUNT_SID'], ['TWILIO_AUTH_TOKEN'], ['TWILIO_PHONE_NUMBER'], ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'], ['NEXT_PUBLIC_BASE_URL']],
    unlocks: 'Phone calls made by an AI assistant, turn by turn, for a purpose you write.',
    automatic: 'Only when you start a call. Each call is a short conversation, with a transcript.',
    consent: 'Only to people who agreed to AI calls, inside calling hours, with a daily cap. It says at the start that it is an AI, and it stops the moment someone asks. Check the law where you call before you use it.',
  },
];

/**
 * Deployment settings: set once on the server (.env), not per account. They always count, in SaaS mode too.
 * Account keys (the Integrations page) are the only keys that a SaaS account may use; these are the operator's own setup.
 */
export const SERVER_SETTINGS = [
  { name: 'TOKEN_ENC_KEY', why: 'Needed to save any account key. Without it, keys cannot be stored.', groups: [['TOKEN_ENC_KEY']] },
  { name: 'NEXT_PUBLIC_BASE_URL', why: 'The public https address: pay links, quote accept links, call and reply webhooks.', groups: [['NEXT_PUBLIC_BASE_URL']] },
  { name: 'PAY_SECRET (or UNSUBSCRIBE_SECRET / WEBHOOK_SECRET)', why: 'Signs pay links, call links and unsubscribe links.', groups: [['PAY_SECRET', 'UNSUBSCRIBE_SECRET', 'WEBHOOK_SECRET']] },
  { name: 'Gmail sign-in (NEXT_PUBLIC_GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_CLIENT_SECRET)', why: 'Lets each owner connect their own Gmail in Account.', groups: [['NEXT_PUBLIC_GOOGLE_CLIENT_ID'], ['NEXT_PUBLIC_GOOGLE_CLIENT_SECRET']] },
];
const SERVER_ONLY = new Set(SERVER_SETTINGS.flatMap((x) => x.groups.flat()));

/** Each deployment setting, and whether it is present. Never returns a value. */
export function serverSettingsStatus(env = {}) {
  return SERVER_SETTINGS.map((x) => ({
    name: x.name, why: x.why,
    present: x.groups.every((g) => g.some((k) => String(env?.[k] ?? '').trim() !== '')),
  }));
}

/** The addresses to paste into the provider consoles, from the public address. Null until that address is set (https). */
export function webhookUrls(env = {}) {
  const base = String(env?.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(base)) return null;
  return {
    twilioMessages: `${base}/api/inbound/twilio`,
    twilioVoice: `${base}/api/voice/inbound`,
    stripePayments: `${base}/api/payments/webhook`,
  };
}

/** @param env      server settings (used only when not in SaaS mode)
 *  @param account  per-key presence for this account: { KEY: 'account' | 'server' | '' } (see presenceFor); never values
 *  @returns {{id,label,state:'ready'|'needs_keys'|'not_built',missing:string[],unlocks,automatic,consent,reason?}[]} */
export function integrationStatus(env = {}, { account = {}, saas = false } = {}) {
  const present = (k) => String(env?.[k] ?? '').trim() !== '';
  const has = (k) => account[k] === 'account' || (SERVER_ONLY.has(k) ? present(k) : (!saas && present(k)));
  return INTEGRATIONS.map((i) => {
    const { need, ...shown } = i;
    if (i.status === 'not_built') return { ...shown, state: 'not_built', missing: [] };
    const missing = (need || []).filter((group) => !group.some(has)).map((group) => group.join(' or '));
    return { ...shown, state: missing.length === 0 ? 'ready' : 'needs_keys', missing };
  });
}
