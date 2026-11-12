// lib/server/operator-settings.js - app-level keys the operator sets in the app (encrypted), read through one helper. Bootstrap values stay on the server. Never throws.
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { encryptSecret, decryptSecret, vaultConfigured } from './token-vault.js';

// Keys an admin can set in the app: sign-in and connection apps, AI providers, and payment platform keys.
export const OPERATOR_KEYS = [
  'NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'NEXT_PUBLIC_GOOGLE_CLIENT_SECRET', 'NEXT_PUBLIC_BASE_URL', 'CONNECT_STATE_SECRET',
  'EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_RUNAME',
  'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET',
  'SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET',
  'STRIPE_CONNECT_CLIENT_ID', 'STRIPE_PLATFORM_SECRET_KEY', 'STRIPE_PLATFORM_WEBHOOK_SECRET',
  'META_APP_ID', 'META_OAUTH_SECRET', 'TIKTOK_APP_ID', 'TIKTOK_APP_SECRET',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'AI_PROVIDER', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
];

const DOC = ['operator_settings', 'config'];
const TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, values: {} };

/** Reads and decrypts the app-set keys into memory. Cheap when warm; never throws. */
export async function warmOperatorSettings(db, { force = false, now = Date.now() } = {}) {
  if (!db) return;
  if (!force && now - cache.at < TTL_MS) return;
  try {
    const snap = await getDoc(doc(db, ...DOC));
    const boxes = snap?.data?.()?.values || {};
    const values = {};
    for (const [k, box] of Object.entries(boxes)) {
      if (!OPERATOR_KEYS.includes(k)) continue;
      try { const v = decryptSecret(box); if (v) values[k] = v; } catch { /* unreadable value is ignored */ }
    }
    cache = { at: now, values };
  } catch (e) {
    cache = { at: now, values: cache.values };
  }
}

/** The environment with app-set keys on top. An app-set value wins over the server setting. */
export function operatorEnv(base = process.env) {
  return { ...base, ...cache.values };
}

/** Which keys are set, and where from. Never returns a value. */
export function operatorStatus(base = process.env) {
  return OPERATOR_KEYS.map((name) => ({ name, source: cache.values[name] ? 'app' : base[name] ? 'server' : 'missing' }));
}

export async function saveOperatorSettings(db, updates = {}, actor = '') {
  if (!vaultConfigured()) return { ok: false, error: 'The server\'s encryption key is not set, so keys cannot be saved in the app yet.' };
  for (const k of Object.keys(updates)) if (!OPERATOR_KEYS.includes(k)) return { ok: false, error: `${k} cannot be set in the app.` };
  const snap = await getDoc(doc(db, ...DOC)).catch(() => null);
  const next = { ...(snap?.data?.()?.values || {}) };
  let changed = 0;
  for (const [k, raw] of Object.entries(updates)) {
    const v = String(raw ?? '').trim();
    if (!v) { if (next[k]) { delete next[k]; changed++; } continue; }
    if (v.length > 500) return { ok: false, error: `${k} is too long.` };
    next[k] = encryptSecret(v);
    changed++;
  }
  await setDoc(doc(db, ...DOC), { values: next, updatedBy: String(actor).slice(0, 200), updatedAt: new Date().toISOString() });
  await warmOperatorSettings(db, { force: true });
  return { ok: true, changed };
}
