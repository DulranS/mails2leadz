// lib/switches.js - the owner's on/off switches for the optional features, and what each one needs before it can run.
// A switch runs only when the owner has turned it on AND the server has the keys it needs. Pure.
export const SWITCHES = {
  enrichDeals: { label: 'Enrich deals with job title and company size (Apollo)', needs: ['APOLLO_API_KEY'], default: false },
  tiktokSync: { label: 'Send confirmed sign-ups to TikTok as hashed events', needs: ['TIKTOK_PIXEL_CODE', 'TIKTOK_EVENTS_TOKEN'], default: false },
  holdClaimRisk: { label: 'Hold drafts that make price, result or urgency claims for my review', needs: [], default: true },
  googleSync: { label: 'Send confirmed sign-ups to a Google Ads Customer Match list (hashed)', needs: ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN'], default: false },
  liveVoice: { label: 'Live voice conversations from my browser (test and demo)', needs: ['OPENAI_API_KEY'], default: false },
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
