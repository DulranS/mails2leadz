// lib/server/integration-secrets.js - keys for the connections (ad spend, card payments, WhatsApp), stored PER ACCOUNT, encrypted.
// Rule: in SaaS mode (SAAS_MODE=on) an account NEVER uses the operator's server keys for these. Otherwise one customer's invoice
// payments would land in the operator's Stripe account, and another's WhatsApp would send from the operator's number.
// Self-hosted (SAAS_MODE off): the owner's own server settings are used when no account key is stored.
import { getDoc, setDoc, doc } from '../server-firestore.js';
import { encryptSecret, decryptSecret, vaultConfigured } from './token-vault.js';
import { saasEnabled } from '../tenant.js';

export const AD_NAMES = [
  'META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID',
  'GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
];
export const PAYMENT_NAMES = ['STRIPE_PAYMENTS_SECRET_KEY', 'STRIPE_PAYMENTS_WEBHOOK_SECRET', 'STRIPE_CONNECTED_ACCOUNT_ID'];
export const WA_NAMES = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM', 'TWILIO_WA_TEMPLATE_QUOTE', 'TWILIO_WA_TEMPLATE_FOLLOWUP', 'TWILIO_WA_TEMPLATE_INVOICE'];
export const CALL_NAMES = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
export const ENRICH_NAMES = ['HUNTER_API_KEY', 'APOLLO_API_KEY', 'PDL_API_KEY'];
export const FORM_KEY_NAMES = ['TYPEFORM_WEBHOOK_SECRET', 'TALLY_SIGNING_SECRET', 'LINKEDIN_LEAD_KEY', 'TIKTOK_LEAD_KEY', 'GOOGLE_ADS_LEAD_KEY', 'META_APP_SECRET', 'META_PAGE_ACCESS_TOKEN', 'META_PAGE_ID', 'META_VERIFY_TOKEN'];
export const DEAL_NAMES = ['COMPANIES_HOUSE_API_KEY'];
export const STORE_NAMES = ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ACCESS_TOKEN', 'EBAY_USER_TOKEN', 'EBAY_REFRESH_TOKEN'];
export const VOICE_AGENT_NAMES = ['VAPI_API_KEY', 'VAPI_PHONE_NUMBER_ID', 'VAPI_WEBHOOK_SECRET'];
export const SOCIAL_NAMES = ['GOOGLE_ADS_CONVERSION_ACTION', 'META_DATASET_ID', 'META_CAPI_TOKEN', 'TIKTOK_PIXEL_CODE', 'TIKTOK_EVENTS_TOKEN', 'GA4_MEASUREMENT_ID', 'GA4_API_SECRET'];
export const SIGNAL_NAMES = ['COMPANIES_HOUSE_KEY']; // the UK company register, for newly registered companies
export const SHIPPING_NAMES = ['EASYPOST_API_KEY']; // shipping labels and tracking, paid from the owner's own carrier account
export const CALENDAR_NAMES = ['OWNER_CALENDAR_ICS'];
export const AI_NAMES = ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];
export const SECRET_NAMES = [...new Set([...AD_NAMES, ...PAYMENT_NAMES, ...CALL_NAMES, ...WA_NAMES, ...ENRICH_NAMES, ...CALENDAR_NAMES, ...AI_NAMES, ...SIGNAL_NAMES, ...SHIPPING_NAMES, ...SOCIAL_NAMES, ...FORM_KEY_NAMES, ...VOICE_AGENT_NAMES, ...DEAL_NAMES, ...STORE_NAMES])];
const NUMBER_NAMES = ['TWILIO_PHONE_NUMBER', 'TWILIO_WHATSAPP_FROM'];
const MAX_VALUE = 300;

/** The value to use for one key: the account's own (already decrypted), else the server's only when not in SaaS mode. */
export function resolveSecret(name, { account = {}, env = {}, saas = false } = {}) {
  if (typeof account[name] === 'string' && account[name]) return account[name];
  if (saas) return '';
  return String(env[name] ?? '').trim();
}

/** Reads the account's stored (encrypted) boxes. Missing doc = none. */
export async function accountSecretBoxes(db, uid) {
  const snap = await getDoc(doc(db, 'users', uid, 'settings', 'integrations'));
  if (!snap.exists()) return {};
  const data = snap.data() || {};
  const out = {};
  for (const n of SECRET_NAMES) if (data[n] && typeof data[n] === 'object') out[n] = data[n];
  return out;
}

/** Decrypts what can be decrypted. Without the vault key nothing can be read, so nothing is used (never a wrong value). */
export function decryptAccount(boxes = {}) {
  if (!vaultConfigured()) return {};
  const out = {};
  for (const [n, box] of Object.entries(boxes)) {
    try { out[n] = decryptSecret(box); } catch { /* a changed or wrongly-keyed value is ignored */ }
  }
  return out;
}

/** The values to use for the given key names, for this account. */
export async function secretsFor(db, uid, names, { env = process.env, saas = saasEnabled(env) } = {}) {
  const account = decryptAccount(await accountSecretBoxes(db, uid));
  const out = {};
  for (const n of names) out[n] = resolveSecret(n, { account, env, saas });
  return out;
}

/** Which keys are set, and where from. Never returns a value. */
export function presenceFor(boxes = {}, names = SECRET_NAMES, { env = process.env, saas = saasEnabled(env) } = {}) {
  const out = {};
  for (const n of names) {
    out[n] = boxes[n] ? 'account' : (!saas && String(env[n] ?? '').trim() ? 'server' : '');
  }
  return out;
}

/** Stores (or, with an empty value, removes) one key for the account, encrypted. Refuses unknown names and long values. */
export async function writeAccountSecret(db, uid, name, value) {
  if (!SECRET_NAMES.includes(name)) throw new Error('Unknown key name.');
  const v = String(value ?? '').trim();
  if (v.length > MAX_VALUE) throw new Error('That value is too long.');
  const previous = await accountSecretBoxes(db, uid);
  const box = v ? encryptSecret(v) : null; // throws without TOKEN_ENC_KEY: a key is never stored in plain text
  await setDoc(doc(db, 'users', uid, 'settings', 'integrations'), { [name]: box, updatedAt: new Date().toISOString() }, { merge: true });
  // The Twilio numbers are indexed, so an inbound reply can be matched to its account. A changed number releases the old one.
  if (NUMBER_NAMES.includes(name) && v) {
    const holder = await accountForNumber(db, v);
    if (holder && holder !== uid) throw new Error('This number is already used by another account.');
  }
  if (NUMBER_NAMES.includes(name)) {
    const before = previous[name] ? decryptAccount({ [name]: previous[name] })[name] : '';
    if (before && before !== v) await indexNumber(db, uid, before, null);
    if (v) await indexNumber(db, uid, v, uid);
  }
  return { set: !!box };
}

/** twilio_numbers/{number} -> { uid }. A number used by two accounts is indexed to the last one saved (a known limit). */
export async function indexNumber(db, uid, raw, owner) {
  const number = String(raw || '').replace(/^whatsapp:/i, '').trim();
  if (!number) return;
  await setDoc(doc(db, 'twilio_numbers', number), { uid: owner, updatedAt: new Date().toISOString() }, { merge: true });
}

/** The account a Twilio number belongs to, or null. */
export async function accountForNumber(db, raw) {
  const number = String(raw || '').replace(/^whatsapp:/i, '').trim();
  if (!number) return null;
  const snap = await getDoc(doc(db, 'twilio_numbers', number));
  return snap.exists() && snap.data().uid ? snap.data().uid : null;
}

export { vaultConfigured };

/**
 * The AI provider keys for one account. In SaaS mode an account uses its own keys; the operator's keys are used only when
 * SAAS_OPERATOR_AI=on (the operator then pays for AI on the plan). Self-hosted: the server settings, as before.
 * Returns { deepseek, openai, anthropic } with '' for a missing key.
 */
export async function aiKeysFor(db, uid, { env = process.env } = {}) {
  const saas = saasEnabled(env);
  const operator = String(env.SAAS_OPERATOR_AI || '').trim().toLowerCase() === 'on';
  const s = await secretsFor(db, uid, AI_NAMES, { env, saas });
  const fromOperator = (name) => (operator ? String(env[name] || '').trim() : '');
  return {
    deepseek: s.DEEPSEEK_API_KEY || fromOperator('DEEPSEEK_API_KEY'),
    openai: s.OPENAI_API_KEY || fromOperator('OPENAI_API_KEY'),
    anthropic: s.ANTHROPIC_API_KEY || fromOperator('ANTHROPIC_API_KEY') || (operator ? String(env.CLAUDE_API_KEY || '').trim() : ''),
  };
}
