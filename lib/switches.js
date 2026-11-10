// lib/switches.js - the owner's on/off switches for the optional features, and what each one needs before it can run.
// A switch runs only when the owner has turned it on AND the server has the keys it needs. Pure.
export const SWITCHES = {
  enrichDeals: { label: 'Enrich deals and leads with job title and company (Apollo, then People Data Labs; uses whichever key is set)', needs: [], default: false },
  tiktokSync: { label: 'Send confirmed sign-ups to TikTok as hashed events', needs: ['TIKTOK_PIXEL_CODE', 'TIKTOK_EVENTS_TOKEN'], default: false },
  holdClaimRisk: { label: 'Hold drafts that make price, result or urgency claims for my review', needs: [], default: true },
  googleSync: { label: 'Send confirmed sign-ups to a Google Ads Customer Match list (hashed)', needs: ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN'], default: false },
  journeyAutoSend: { label: 'Send journey emails automatically, only to people you have recorded as agreeing (opt-out and do-not-contact rules apply)', needs: ['NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'NEXT_PUBLIC_GOOGLE_CLIENT_SECRET'], default: false },
  rentalTexts: { label: 'Send check-out and extension texts to rental customers who agreed to texts', needs: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'], default: false },
  stripeConnect: { label: 'Take card payments through Stripe Connect (one approval, no keys to paste)', needs: ['STRIPE_CONNECT_CLIENT_ID', 'STRIPE_PLATFORM_SECRET_KEY'], default: false },
  liveVoice: { label: 'Live voice conversations from my browser (test and demo)', needs: ['OPENAI_API_KEY'], default: false },
  supportAutoReply: { label: 'Answer customers\' WhatsApp and SMS questions from my own answer library (everything else goes to my support queue)', needs: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'], default: false },
  ebayAutoPublish: { label: 'Publish changed products on eBay with my own policies and category (live listings)', needs: ['EBAY_USER_TOKEN'], default: false },
  visitorVoice: { label: 'Voice chat for visitors on my public site', needs: ['OPENAI_API_KEY'], default: false },
};

/** { on, status } where status is 'on' | 'off' | 'needs_keys'. */
export function switchState(id, settings = {}, env = {}) {
  const def = SWITCHES[id];
  if (!def) return { on: false, status: 'off', missing: [] };
  const turnedOn = typeof settings?.switches?.[id] === 'boolean' ? settings.switches[id] : def.default;
  if (!turnedOn) return { on: false, status: 'off', missing: [] };
  const missing = def.needs.filter((k) => !env[k]);
  if (missing.length) return { on: false, status: 'needs_keys', missing };
  return { on: true, status: 'on', missing: [] };
}

/** Keeps only known switches with boolean values. */
export function sanitizeSwitches(raw) {
  const out = {};
  for (const id of Object.keys(SWITCHES)) if (raw && typeof raw[id] === 'boolean') out[id] = raw[id];
  return out;
}
