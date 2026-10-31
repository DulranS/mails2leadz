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
export const PAYMENT_NAMES = ['STRIPE_PAYMENTS_SECRET_KEY', 'STRIPE_PAYMENTS_WEBHOOK_SECRET'];
export const WA_NAMES = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM', 'TWILIO_WA_TEMPLATE_QUOTE', 'TWILIO_WA_TEMPLATE_FOLLOWUP', 'TWILIO_WA_TEMPLATE_INVOICE'];
export const CALL_NAMES = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
export const SECRET_NAMES = [...new Set([...AD_NAMES, ...PAYMENT_NAMES, ...CALL_NAMES, ...WA_NAMES])];
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
  const box = v ? encryptSecret(v) : null; // throws without TOKEN_ENC_KEY: a key is never stored in plain text
  await setDoc(doc(db, 'users', uid, 'settings', 'integrations'), { [name]: box, updatedAt: new Date().toISOString() }, { merge: true });
  return { set: !!box };
}

export { vaultConfigured };
