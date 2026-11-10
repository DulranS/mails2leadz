// lib/quick-links.js - every outside tool the app works with, one click away. Pure: the list and the search. Links open in a new tab; nothing is sent.
export const EXTERNAL_LINKS = [
  { id: 'stripe', label: 'Stripe dashboard (payments)', url: 'https://dashboard.stripe.com', group: 'Payments' },
  { id: 'shopify', label: 'Shopify admin (products and orders)', url: 'https://admin.shopify.com', group: 'Store' },
  { id: 'ebay', label: 'eBay seller hub', url: 'https://www.ebay.com/sh/ovw', group: 'Store' },
  { id: 'google-ads', label: 'Google Ads', url: 'https://ads.google.com', group: 'Ads' },
  { id: 'meta-suite', label: 'Meta Business Suite (Facebook and Instagram)', url: 'https://business.facebook.com', group: 'Ads' },
  { id: 'meta-events', label: 'Meta Events Manager (pixel and purchases)', url: 'https://business.facebook.com/events_manager2', group: 'Ads' },
  { id: 'tiktok-ads', label: 'TikTok Ads Manager', url: 'https://ads.tiktok.com', group: 'Ads' },
  { id: 'linkedin-campaign', label: 'LinkedIn Campaign Manager', url: 'https://www.linkedin.com/campaignmanager', group: 'Ads' },
  { id: 'ga4', label: 'Google Analytics (GA4)', url: 'https://analytics.google.com', group: 'Analytics' },
  { id: 'search-console', label: 'Google Search Console', url: 'https://search.google.com/search-console', group: 'Analytics' },
  { id: 'gbp', label: 'Google Business Profile', url: 'https://business.google.com', group: 'Analytics' },
  { id: 'places-api', label: 'Google Places API (key and usage)', url: 'https://console.cloud.google.com/apis/library/places-backend.googleapis.com', group: 'Data' },
  { id: 'companies-house', label: 'Companies House (company search)', url: 'https://find-and-update.company-information.service.gov.uk', group: 'Data' },
  { id: 'land-registry', label: 'HM Land Registry (sold prices)', url: 'https://www.gov.uk/search-property-information-land-registry', group: 'Data' },
  { id: 'twilio', label: 'Twilio console (SMS, WhatsApp, calls)', url: 'https://console.twilio.com', group: 'Messaging' },
  { id: 'slack', label: 'Slack', url: 'https://slack.com/app', group: 'Messaging' },
  { id: 'vapi', label: 'Vapi dashboard (AI phone calls)', url: 'https://dashboard.vapi.ai', group: 'Messaging' },
  { id: 'typeform', label: 'Typeform', url: 'https://admin.typeform.com', group: 'Forms' },
  { id: 'tally', label: 'Tally', url: 'https://tally.so', group: 'Forms' },
  { id: 'dropbox-sign', label: 'Dropbox Sign (signatures)', url: 'https://app.hellosign.com', group: 'Contracts' },
  { id: 'google-cloud', label: 'Google Cloud console (API keys)', url: 'https://console.cloud.google.com/apis/credentials', group: 'Setup' },
];

export const INTERNAL_LINKS = [
  { id: 'dashboard', label: 'Dashboard', url: '/dashboard', group: 'Screens' },
  { id: 'crm', label: 'CRM, pipeline and sales tools', url: '/crm', group: 'Screens' },
  { id: 'business', label: 'Business pipeline', url: '/business', group: 'Screens' },
  { id: 'customers', label: 'Customers', url: '/customers', group: 'Screens' },
  { id: 'integrations', label: 'Integrations (keys and connections)', url: '/integrations', group: 'Screens' },
  { id: 'account', label: 'Account and switches', url: '/account', group: 'Screens' },
  { id: 'conversations', label: 'Conversations', url: '/conversations', group: 'Screens' },
];

/** The palette's search: matches words in the label or the group, case-insensitive. */
export function searchLinks(query, list = [...INTERNAL_LINKS, ...EXTERNAL_LINKS]) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((l) => { const hay = `${l.label} ${l.group}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
}
