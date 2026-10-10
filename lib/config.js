const requiredEnv = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    console.warn(`[config] Required environment variable ${name} is not set.`);
  }
  return value;
};

const optionalEnv = (name, fallback) => process.env[name] ?? fallback;

const getBooleanEnv = (name, defaultValue = false) => {
  const value = process.env[name];
  if (typeof value === 'undefined' || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

export const ENVIRONMENT = process.env.NODE_ENV || 'development';
export const SERVICE_NAME = 'auto-leads';

export const GOOGLE_CLIENT_ID = optionalEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '');
export const GOOGLE_CLIENT_SECRET = optionalEnv('GOOGLE_CLIENT_SECRET', '');
export const GOOGLE_REDIRECT_URI = optionalEnv('NEXT_PUBLIC_GOOGLE_REDIRECT_URI', '');
export const OPENAI_API_KEY = optionalEnv('OPENAI_API_KEY', '');
export const CRUNCHBASE_API_KEY = optionalEnv('CRUNCHBASE_API_KEY', '');
export const GMAIL_SENDER_EMAIL = optionalEnv('GMAIL_SENDER_EMAIL', '');
export const CALENDLY_LINK = optionalEnv('CALENDLY_LINK', '');
export const BASE_URL = optionalEnv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000');

export function validateRequiredEnv() {
  const missing = [];
  if (!process.env.DEEPSEEK_API_KEY && !OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY) missing.push('DEEPSEEK_API_KEY (or OPENAI_API_KEY / ANTHROPIC_API_KEY)');
  if (!GOOGLE_CLIENT_ID) missing.push('NEXT_PUBLIC_GOOGLE_CLIENT_ID');
  if (!GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');

  if (missing.length > 0) {
    console.warn(`[config] Missing required environment variables: ${missing.join(', ')}`);
  }
  return missing;
}
