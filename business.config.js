/**
 * business.config.js
 * -------------------
 * No longer the runtime source of truth — each SME account now stores its
 * own business identity in the `accounts` table, editable from
 * /dashboard/settings (see lib/account.js). This file only supplies the
 * starting defaults a brand-new account gets before anyone fills in their
 * settings, so first login isn't a blank, broken form.
 */

const defaultAccountFields = {
  name: 'My Business',
  sender_name: '',
  sender_role: 'Founder',
  offer_type: 'service', // 'product' | 'service'
  offer_description: 'We help businesses get more done with less manual work.',
  cta: 'a 15-minute call this week',
  tone: 'direct, warm, no corporate fluff',
  channel_email: true,
  channel_whatsapp: false,
  max_emails_per_day: 40,
  max_whatsapp_per_day: 40,
  min_hours_between_followups: 48,
  max_followups: 3,
};

module.exports = { defaultAccountFields };
