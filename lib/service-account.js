// lib/service-account.js - reads the Firebase service-account key from an environment variable, forgivingly. Pure (no dependencies), so it is tested.
//
// Accepted forms of FIREBASE_SERVICE_ACCOUNT_JSON: the downloaded JSON as it is, the same JSON on one line, the JSON wrapped in
// quotes (hosts often add them), or the base64 of it. A private key with literal "\n" is repaired.

/** @returns {object | null} the parsed key object, or null when the text is not a JSON key in any accepted form. */
export function parseServiceAccount(raw) {
  let t = String(raw ?? '').trim();
  if (!t) return null;
  for (let i = 0; i < 4; i++) {
    if (t.startsWith('{')) {
      try { const v = JSON.parse(t); return v && typeof v === 'object' ? v : null; } catch { return null; }
    }
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      try { const v = JSON.parse(t); if (typeof v === 'string') { t = v.trim(); continue; } } catch { /* not a JSON string: just drop the quotes */ }
      t = t.slice(1, -1).trim();
      continue;
    }
    const decoded = Buffer.from(t.replace(/\s+/g, ''), 'base64').toString('utf8').trim(); // base64 ignores whitespace, so a wrapped paste still works
    if (decoded.startsWith('{') || decoded.startsWith('"')) { t = decoded; continue; }
    return null;
  }
  return null;
}

/** Fixes escaped newlines in the private key and returns just the fields Firebase needs. */
export function normalizeServiceAccount(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const key = typeof parsed.private_key === 'string' ? parsed.private_key.replace(/\\n/g, '\n').trim() : parsed.private_key;
  return { ...parsed, private_key: key };
}

/** @returns {string} '' when the key looks usable, otherwise a plain-language reason (shown in the connection check). */
export function serviceAccountProblem(account) {
  if (!account || typeof account !== 'object') return 'The key is not a JSON object.';
  if (account.type && account.type !== 'service_account') return 'This JSON is not a service-account key (its "type" is not "service_account"). Download it from Project settings > Service accounts.';
  const missing = ['project_id', 'client_email', 'private_key'].filter((k) => !account[k]);
  if (missing.length) return `The key is missing ${missing.join(', ')}. Paste the whole downloaded JSON.`;
  if (!/-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+-----END (RSA )?PRIVATE KEY-----/.test(String(account.private_key))) return 'The private key is damaged (it was cut or changed while pasting). Paste the whole downloaded JSON again.';
  return '';
}

/** @returns {{ key: string, app: string } | null} when the key belongs to a different Firebase project than the web app uses. */
export function projectMismatch(account, appProjectId) {
  const key = String(account?.project_id || '').trim();
  const app = String(appProjectId || '').trim();
  return key && app && key !== app ? { key, app } : null;
}
