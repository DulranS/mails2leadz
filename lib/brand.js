// lib/brand.js - the product name shown to customers. Set NEXT_PUBLIC_APP_NAME to white-label it.
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'AutoLeads';
export const APP_TAGLINE = 'Outreach, follow-ups and a pipeline you can trust';
export const APP_DESCRIPTION =
  'Reach out to prospects, follow up on time, track replies and see which conversations are turning into revenue. You stay in control of everything that gets sent.';
// Optional: shown on the landing page if set (a contact address for buyers).
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || '';
