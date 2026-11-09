// lib/setup-status.js - one list of every optional feature, the server settings it needs, and what is still missing. Pure.
// Used by `npm run setup:status` (what is on, what is missing) and `npm run setup:env` (a .env template with every key).
export const FEATURES = [
  { id: 'core', label: 'Core settings (every installation)', keys: ['SAAS_MODE', 'ADMIN_EMAILS', 'ALLOWED_EMAILS', 'INTERNAL_EMAILS', 'CRON_SECRET', 'WEBHOOK_SECRET', 'UNSUBSCRIBE_SECRET', 'TOKEN_ENC_KEY', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_SERVER_EMAIL', 'FIREBASE_SERVER_PASSWORD', 'NEXT_PUBLIC_APP_NAME', 'NEXT_PUBLIC_BASE_URL', 'NEXT_PUBLIC_CONTACT_EMAIL', 'NEXT_PUBLIC_DEFAULT_COUNTRY_CODE', 'NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_APP_ID', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'NEXT_PUBLIC_GOOGLE_REDIRECT_URI', 'API_RATE_LIMIT_PER_MIN', 'AI_DAILY_CALL_LIMIT', 'AI_MONTHLY_BUDGET_USD', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'NEXT_PUBLIC_GOOGLE_CLIENT_SECRET', 'META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_STARTER', 'STRIPE_PRICE_GROWTH', 'STRIPE_PAYMENTS_SECRET_KEY', 'STRIPE_PAYMENTS_WEBHOOK_SECRET', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'TWILIO_WHATSAPP_FROM', 'TWILIO_RECORD_CALLS', 'TWILIO_WA_TEMPLATE_FOLLOWUP', 'TWILIO_WA_TEMPLATE_INVOICE', 'TWILIO_WA_TEMPLATE_QUOTE'] },
  { id: 'operator', label: 'Operator settings (set once, by whoever runs the app)', keys: ['STRIPE_CONNECT_CLIENT_ID', 'STRIPE_PLATFORM_SECRET_KEY', 'STRIPE_PLATFORM_WEBHOOK_SECRET', 'PAY_SECRET', 'QUOTE_SECRET', 'CONNECT_STATE_SECRET', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CONFIG', 'FIREBASE_MEASUREMENT_ID', 'FIREBASE_MESSAGING_SENDER_ID', 'AUTOLEADS_CONTACT', 'PLAN_OVERRIDES_JSON', 'TRACK_OPENS', 'VOICE_RECORD_CALLS', 'VOICE_AGENT_DAILY_CAP', 'AI_PROVIDER', 'CLAUDE_API_KEY', 'DEEPSEEK_BASE_URL', 'AI_MODEL_FAST_ANTHROPIC', 'AI_MODEL_SMART', 'AI_MODEL_SMART_ANTHROPIC', 'AI_MODEL_SMART_DEEPSEEK', 'AI_PRICE_JSON', 'OVERPASS_URL', 'NOMINATIM_URL', 'REDIS_URL', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_OFFLINE_REDIRECT_URI', 'GMAIL_SENDER_EMAIL', 'CALENDAR_OFFLINE_REDIRECT_URI', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'OUTLOOK_REDIRECT_URI', 'META_APP_ID', 'META_OAUTH_SECRET', 'TIKTOK_APP_ID', 'TIKTOK_APP_SECRET', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_RUNAME', 'GOOGLE_ADS_DEVELOPER_TOKEN', 'CONNECT_STATE_SECRET'] },
  { id: 'meta_leads', label: 'Meta Lead Ads (Facebook and Instagram forms)', keys: ['META_APP_SECRET', 'META_VERIFY_TOKEN', 'META_PAGE_ACCESS_TOKEN', 'META_PAGE_ID', 'META_OWNER_UID'] },
  { id: 'meta_sync', label: 'Confirmed sign-ups to Meta (hashed)', keys: ['META_DATASET_ID', 'META_CAPI_TOKEN'] },
  { id: 'google_leads', label: 'Google Ads lead forms', keys: ['GOOGLE_ADS_LEAD_KEY', 'GOOGLE_ADS_OWNER_UID'] },
  { id: 'ga4', label: 'GA4 conversions (for Google Ads)', keys: ['GA4_MEASUREMENT_ID', 'GA4_API_SECRET'] },
  { id: 'tiktok_sync', label: 'TikTok sign-up events (hashed)', keys: ['TIKTOK_PIXEL_CODE', 'TIKTOK_EVENTS_TOKEN'] },
  { id: 'tiktok_leads', label: 'TikTok lead forms', keys: ['TIKTOK_LEAD_KEY', 'FORMS_OWNER_UID'] },
  { id: 'linkedin_leads', label: 'LinkedIn lead-gen forms', keys: ['LINKEDIN_LEAD_KEY', 'FORMS_OWNER_UID'] },
  { id: 'typeform', label: 'Typeform lead forms', keys: ['TYPEFORM_WEBHOOK_SECRET', 'FORMS_OWNER_UID'] },
  { id: 'tally', label: 'Tally lead forms', keys: ['TALLY_SIGNING_SECRET', 'FORMS_OWNER_UID'] },
  { id: 'google_match', label: 'Google Ads Customer Match (hashed confirmed sign-ups)', keys: ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN'] },
  { id: 'live_voice', label: 'Live voice from the browser', keys: ['OPENAI_API_KEY'] },
  { id: 'apollo', label: 'Apollo enrichment (deals and inbox leads)', keys: ['APOLLO_API_KEY'] },
  { id: 'hunter', label: 'Hunter: company lookup and mailbox checks', keys: ['HUNTER_API_KEY'] },
  { id: 'push', label: 'Browser and phone alerts (push)', keys: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY'] },
];

/** Each feature with its status: 'on' when every key is set, 'partial' when some are, 'off' when none are. */
export function featureStatus(env = {}, features = FEATURES) {
  return features.map((f) => {
    const missing = f.keys.filter((k) => !env[k]);
    const status = missing.length === 0 ? 'on' : missing.length === f.keys.length ? 'off' : 'partial';
    return { id: f.id, label: f.label, status, missing };
  });
}

/** A .env template: every key once, grouped by feature, with the feature it switches on. Values are left blank. */
export function envTemplate(features = FEATURES) {
  const seen = new Set();
  const out = ['# AutoLeads server settings. Fill in only the features you want; leave the rest blank.', ''];
  for (const f of features) {
    out.push(`# ${f.label}`);
    for (const k of f.keys) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(`${k}=`);
    }
    out.push('');
  }
  return out.join('\n');
}
