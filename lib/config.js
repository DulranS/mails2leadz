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

export const ENRICH_ENDPOINT = requiredEnv('ENRICH_ENDPOINT', 'https://wweobtkj7f.execute-api.us-east-1.amazonaws.com/prod/enrich');
export const DEFAULT_ENRICH_TIMEOUT_MS = 30_000;
export const ENRICH_RETRY_COUNT = 2;
export const ENRICH_RETRY_DELAY_MS = 700;
export const ENABLE_ENRICH_PROXY = getBooleanEnv('ENABLE_ENRICH_PROXY', true);

export const SUPABASE_URL = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
export const SUPABASE_ANON_KEY = requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
export const SUPABASE_SERVICE_ROLE_KEY = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');

export const GOOGLE_CLIENT_ID = optionalEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '');
export const GOOGLE_CLIENT_SECRET = optionalEnv('NEXT_PUBLIC_GOOGLE_CLIENT_SECRET', '');
export const GOOGLE_REDIRECT_URI = optionalEnv('NEXT_PUBLIC_GOOGLE_REDIRECT_URI', '');
export const OPENAI_API_KEY = optionalEnv('OPENAI_API_KEY', '');
export const CRUNCHBASE_API_KEY = optionalEnv('CRUNCHBASE_API_KEY', '');
export const GMAIL_SENDER_EMAIL = optionalEnv('GMAIL_SENDER_EMAIL', '');
export const CALENDLY_LINK = optionalEnv('CALENDLY_LINK', '');
export const BASE_URL = optionalEnv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000');

export function validateRequiredEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (!GMAIL_SENDER_EMAIL) missing.push('GMAIL_SENDER_EMAIL');
  if (!GOOGLE_CLIENT_ID) missing.push('NEXT_PUBLIC_GOOGLE_CLIENT_ID');
  if (!GOOGLE_CLIENT_SECRET) missing.push('NEXT_PUBLIC_GOOGLE_CLIENT_SECRET');

  if (missing.length > 0) {
    console.warn(`[config] Missing required environment variables: ${missing.join(', ')}`);
  }
  return missing;
}
