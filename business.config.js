/**
 * business.config.js
 * -------------------
 * This is the ONE file you edit to point the whole outbound engine at a
 * different business — software product, service business, agency, whatever.
 * Nothing else in /lib or /app should hardcode business-specific language.
 */

const businessConfig = {
  // Shown in email signatures, WhatsApp intros, and fed to the AI personalizer
  name: process.env.BIZ_NAME || 'Your Company',
  senderName: process.env.BIZ_SENDER_NAME || 'Your Name',
  senderRole: process.env.BIZ_SENDER_ROLE || 'Founder',

  // "product" -> selling software/a tool. "service" -> selling delivered work.
  offerType: process.env.BIZ_OFFER_TYPE || 'service', // 'product' | 'service'

  // One or two sentences. This is the single most important field — it's
  // injected into every AI prompt so personalization stays on-message.
  offerDescription:
    process.env.BIZ_OFFER_DESCRIPTION ||
    'We help businesses automate their outbound sales pipeline end-to-end.',

  // What a "win" looks like when a lead replies positively — used to steer
  // AI-drafted replies and follow-ups toward a concrete next step.
  callToAction: process.env.BIZ_CTA || 'a 15-minute call this week',

  tone: process.env.BIZ_TONE || 'direct, warm, no corporate fluff',

  // Which channels are live. Toggle WhatsApp/SMS on once credentials exist —
  // nothing else needs to change.
  channels: {
    email: (process.env.BIZ_CHANNEL_EMAIL ?? 'true') === 'true',
    whatsapp: (process.env.BIZ_CHANNEL_WHATSAPP ?? 'false') === 'true',
    sms: (process.env.BIZ_CHANNEL_SMS ?? 'false') === 'true',
  },

  limits: {
    maxEmailsPerDay: parseInt(process.env.MAX_EMAILS_PER_DAY || '150', 10),
    maxWhatsappPerDay: parseInt(process.env.MAX_WHATSAPP_PER_DAY || '150', 10),
    minHoursBetweenFollowups: parseInt(process.env.MIN_HOURS_BETWEEN_FOLLOWUPS || '48', 10),
    maxFollowups: parseInt(process.env.MAX_FOLLOWUPS || '3', 10),
  },
};

module.exports = businessConfig;
