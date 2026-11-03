// lib/tiktok-sync.js - the TikTok Events API body for confirmed sign-ups (hashed emails only). Pure.
// Shape follows TikTok's web event format (event_source "web", the pixel code as event_source_id). Verify it against TikTok's
// current Events API documentation before switching the feature on.
import { consentedCustomers, hashEmail } from './consent-guard.js';

export function tiktokEventsBody({ pixelCode, customers = [], eventTime = Date.now() }) {
  return {
    event_source: 'web',
    event_source_id: pixelCode,
    data: consentedCustomers(customers).map((c) => ({
      event: 'SubmitForm',
      event_time: Math.floor(eventTime / 1000),
      user: { email: hashEmail(c.email) },
      properties: { content_name: 'sign-up' },
    })),
  };
}
