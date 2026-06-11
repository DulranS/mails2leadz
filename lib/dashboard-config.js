// lib/dashboard-config.js
// Dashboard configuration constants

export const CONFIG = {
  // Email limits
  MAX_DAILY_EMAILS: 500,
  MAX_DAILY_WHATSAPP: 100,
  MAX_DAILY_SMS: 50,
  MAX_DAILY_CALLS: 30,

  // Contact limits
  MIN_DAYS_BETWEEN_CONTACT: 1,
  MAX_FOLLOW_UPS: 3,
  CAMPAIGN_WINDOW_DAYS: 30,

  // Lead scoring thresholds
  LEAD_SCORE_HOT: 75,
  LEAD_SCORE_WARM: 50,

  // UI settings
  MAX_NOTIFICATIONS: 50,
  AUTO_SAVE_DELAY_MS: 1500,
  DEBOUNCE_DELAY_MS: 300,
  RATE_LIMIT_DELAY_MS: 200,
  NOTIFICATION_DURATION_MS: 5000,
  SESSION_TIMEOUT_MS: 3600000,

  // File limits
  MAX_IMAGES_PER_EMAIL: 3,
  MAX_IMAGE_SIZE_MB: 5,
  MAX_ATTACHMENT_SIZE_MB: 10,
  MAX_ATTACHMENTS_PER_EMAIL: 5,

  // Polling settings
  MAX_POLL_ATTEMPTS: 20,
  POLL_INTERVAL_MS: 6000,

  // Business metrics
  DEFAULT_AVG_DEAL_VALUE: 5000,
  DEFAULT_DEMO_RATE: 0.40,
  DEFAULT_CLOSE_RATE: 0.15,

  // Cache and storage
  CACHE_EXPIRY_MS: 300000,
  MAX_RECENT_CONTACTS: 1000,
  BACKUP_INTERVAL_HOURS: 24,
  ITEMS_PER_PAGE: 50,

  // Batch and retry settings
  BATCH_SIZE: 50,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000
};

export const generateId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};
