// lib/setup-status.js - one list of every optional feature, the server settings it needs, and what is still missing. Pure.
// Used by `npm run setup:status` (what is on, what is missing) and `npm run setup:env` (a .env template with every key).
export const FEATURES = [
  { id: 'meta_leads', label: 'Meta Lead Ads (Facebook and Instagram forms)', keys: ['META_APP_SECRET', 'META_VERIFY_TOKEN', 'META_PAGE_ACCESS_TOKEN', 'META_PAGE_ID', 'META_OWNER_UID'] },
  { id: 'meta_sync', label: 'Confirmed sign-ups to Meta (hashed)', keys: ['META_DATASET_ID', 'META_CAPI_TOKEN'] },
  { id: 'google_leads', label: 'Google Ads lead forms', keys: ['GOOGLE_ADS_LEAD_KEY', 'GOOGLE_ADS_OWNER_UID'] },
  { id: 'ga4', label: 'GA4 conversions (for Google Ads)', keys: ['GA4_MEASUREMENT_ID', 'GA4_API_SECRET'] },
  { id: 'tiktok_sync', label: 'TikTok sign-up events (hashed)', keys: ['TIKTOK_PIXEL_CODE', 'TIKTOK_EVENTS_TOKEN'] },
  { id: 'tiktok_leads', label: 'TikTok lead forms', keys: ['TIKTOK_LEAD_KEY', 'FORMS_OWNER_UID'] },
  { id: 'linkedin_leads', label: 'LinkedIn lead-gen forms', keys: ['LINKEDIN_LEAD_KEY', 'FORMS_OWNER_UID'] },
  { id: 'typeform', label: 'Typeform lead forms', keys: ['TYPEFORM_WEBHOOK_SECRET', 'FORMS_OWNER_UID'] },
  { id: 'tally', label: 'Tally lead forms', keys: ['TALLY_SIGNING_SECRET', 'FORMS_OWNER_UID'] },
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
