// app/api/system-check/route.js
// "Why isn't it working?" in one click. Runs the same operations real requests depend on and
// reports ok / not ok per area. Any signed-in user can run it; the exact fix instructions
// (which name configuration variables) are shown only to ADMIN_EMAILS.
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, deleteDoc, isAdminMode, adminReason, adminProblem, adminProjectMismatch, serverMode, serverLoginProblem } from '../../../lib/server-firestore.js';
import { aiConfig } from '../../../lib/ai-client.js';
import { isRestricted } from '../../../lib/access.js';

export const maxDuration = 30;

// Plain-language reason the server is not in full-access mode (the cause, not just the symptom).
const WHY = {
  no_credentials: 'Neither FIREBASE_SERVICE_ACCOUNT_JSON nor FIREBASE_SERVER_EMAIL + FIREBASE_SERVER_PASSWORD is set on the server.',
  bad_credentials: 'The service-account key cannot be used. Paste the whole downloaded JSON key (or its base64) into FIREBASE_SERVICE_ACCOUNT_JSON.',
  module_missing: 'The firebase-admin package could not be loaded on the server.',
  init_failed: 'The service account was rejected by Firebase (wrong project or a deleted key).',
};
const whyNot = () => (adminProblem() && adminReason() !== 'ok' ? adminProblem() : WHY[adminReason()] || '');
const withTimeout = (p, ms, label) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms / 1000}s`)), ms))]);

function getDb() {
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  return getFirestore(!getApps().length ? initializeApp(cfg) : getApp());
}

export async function GET(request) {
  const uid = request.headers.get('x-user-id');
  const email = (request.headers.get('x-user-email') || '').toLowerCase();
  if (!uid) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  const admins = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = !!email && admins.includes(email);
  const checks = [];
  const add = (id, label, ok, detail, fix) => checks.push({ id, label, ok, detail: ok ? detail : detail || 'Not working', fix: isAdmin ? fix : 'Please contact support.' });

  // 1. Database: can the SERVER write? (the #1 cause of "Internal Server Error" after tightening rules)
  try {
    const db = getDb();
    const ref = doc(db, 'system_checks', `${uid}_ping`);
    await withTimeout(setDoc(ref, { userId: uid, at: new Date().toISOString() }), 8000, 'Database write');
    const back = await withTimeout(getDoc(ref), 8000, 'Database read');
    await withTimeout(deleteDoc(ref), 8000, 'Database cleanup').catch(() => {});
    const ok = back.exists();
    const mode = serverMode();
    add('database', 'Database (server access)', ok, ok ? (mode === 'admin' ? 'Working (full server access).' : mode === 'login' ? 'Working (server login).' : 'Working (limited mode).') : 'Wrote but could not read back.',
      'Check the Firestore project id and that rules are deployed.');
    if (ok && mode === 'none') {
      add('admin', 'Server credentials', false, `Running without server credentials. ${whyNot()}`.trim(),
        'Either set FIREBASE_SERVICE_ACCOUNT_JSON (Firebase console > Project settings > Service accounts > Generate new private key), or, if your project does not allow keys, use server login: see DEPLOYMENT_GUIDE.md ("Server login"). Then redeploy.');
    } else if (ok) {
      add('admin', 'Server credentials', true, mode === 'admin' ? 'Service account active.' : 'Server login active (no service-account key).');
    }
  } catch (e) {
    const msg = String(e?.message || '');
    const denied = /permission|insufficient/i.test(msg);
    // gRPC code 16 / "invalid authentication credentials": the service account key WAS read, but Google refuses it
    // (key deleted or disabled in Google Cloud, key from another project, or a private key damaged when pasted).
    const rejected = serverMode() === 'admin' && (e?.code === 16 || /UNAUTHENTICATED|invalid authentication credentials|invalid_grant|invalid jwt/i.test(msg));
    add('database', 'Database (server access)', false,
      rejected ? (adminProjectMismatch()
          ? `The service-account key is for project "${adminProjectMismatch().key}", but the web app uses "${adminProjectMismatch().app}". Google rejected it.`
          : 'The server has a service-account key, but Google rejected it (it was deleted, disabled, belongs to another project, or was damaged when pasted).')
        : denied ? `The server is not allowed to write to your database. ${serverMode() === 'login' ? 'Server login is set, but the rules do not recognise the server user yet.' : whyNot()}`.trim()
        : (serverLoginProblem() || msg),
      rejected
        ? 'Firebase console > Project settings > Service accounts > Generate new private key (use the project whose id is in NEXT_PUBLIC_FIREBASE_PROJECT_ID; on Google\'s own hosting you can remove the key variable and the default credentials are used). Paste the WHOLE downloaded JSON on ONE line into FIREBASE_SERVICE_ACCOUNT_JSON (or its base64), with no extra quotes. Then delete the old key under Google Cloud > IAM > Service accounts > Keys, and redeploy.'
        : denied
        ? (serverMode() === 'login'
          ? 'Paste the server user\'s UID into firestore.rules (isServer) and republish them: firebase deploy --only firestore:rules.'
          : 'Your Firestore rules are locked down but the server has no credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON (paste the downloaded JSON key) or use server login (DEPLOYMENT_GUIDE.md), then redeploy.')
        : 'Check the NEXT_PUBLIC_FIREBASE_* variables, the server login email/password, and that Email/Password sign-in is enabled in Firebase Authentication.');
  }

  // 2. Gmail sending. The browser gets the Gmail permission through Firebase sign-in (the Google provider), so only the Firebase web
  // config is needed. A separate Google client id + secret only switch on the optional automatic (overnight) Gmail features.
  const fbWeb = ['NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_APP_ID'];
  const fbMissing = fbWeb.filter((n) => !process.env[n]);
  const gid = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const gsec = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET;
  add('gmail', 'Email sending (Gmail)', fbMissing.length === 0,
    fbMissing.length === 0
      ? `Gmail permission comes from your Firebase Google sign-in.${gid && gsec ? ' Automatic Gmail features are also set up.' : ' Automatic overnight Gmail features are off (optional).'}`
      : `Missing: ${fbMissing.join(', ')}.`,
    'Set the NEXT_PUBLIC_FIREBASE_* variables (Firebase console > Project settings > Your apps > Web app), turn on the Google provider under Authentication, and enable the Gmail API in Google Cloud. For automatic overnight Gmail features also set NEXT_PUBLIC_GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_CLIENT_SECRET.');

  // 2b. A client secret under a NEXT_PUBLIC_ name is published to every visitor's browser. The app no longer reads it.
  const legacyName = 'NEXT_PUBLIC_' + 'NEXT_PUBLIC_GOOGLE_CLIENT_SECRET';
  const legacyPresent = !!process.env[legacyName];
  add('secret-exposure', 'Google secret not exposed', !legacyPresent,
    legacyPresent ? `${legacyName} is set. The app ignores it, but any NEXT_PUBLIC_ value is visible to every visitor.` : 'No secret is published to browsers.',
    `Delete ${legacyName} from your hosting environment variables and redeploy, then create a NEW client secret in Google Cloud (the old one was exposed). Only if you use the automatic Gmail features, save the new one as NEXT_PUBLIC_GOOGLE_CLIENT_SECRET.`);

  // 3. AI
  const ai = aiConfig();
  add('ai', 'AI drafting', !!ai.provider, ai.provider ? `Using ${ai.provider} (${ai.models.fast})${ai.providers.length > 1 ? `, with ${ai.providers.slice(1).map((p) => p.name).join(' / ')} as backup` : ''}.` : 'No AI key configured.',
    'Set DEEPSEEK_API_KEY (recommended; or OPENAI_API_KEY / ANTHROPIC_API_KEY), then redeploy. Everything except AI drafting works without it.');

  // 4. Webhooks (only matters if phone calls are used)
  const usesPhone = !!(process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_AUTH_TOKEN);
  add('webhooks', 'Call webhook protection', !!process.env.WEBHOOK_SECRET || !usesPhone,
    process.env.WEBHOOK_SECRET ? 'Protected.' : !usesPhone ? 'Not needed (phone calls are not set up).' : 'No webhook secret set.',
    'Set WEBHOOK_SECRET to a long random string (the app adds ?key= to the call-status callback itself).');

  // 5. Opt-out links (every outgoing email carries one when this is green)
  const base = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  const hasKey = !!(process.env.UNSUBSCRIBE_SECRET || process.env.WEBHOOK_SECRET);
  const httpsBase = /^https:\/\//i.test(base);
  const optOutOk = isAdminMode() && hasKey && httpsBase;
  add('optout', 'Opt-out links in emails', optOutOk,
    optOutOk ? 'Every email carries a one-click opt-out link and List-Unsubscribe headers.' : `Emails are sent WITHOUT an opt-out link. Missing: ${[!isAdminMode() && 'service account', !hasKey && 'secret', !httpsBase && 'https public URL'].filter(Boolean).join(', ')}.`,
    'Set NEXT_PUBLIC_BASE_URL (your https domain), UNSUBSCRIBE_SECRET (a long random string; WEBHOOK_SECRET is used if this is empty) and FIREBASE_SERVICE_ACCOUNT_JSON, then redeploy.');

  // 6. Who can sign up: an open deployment lets any Google account spend your AI budget (per-account caps still apply).
  const restricted = isRestricted();
  add('access', 'Invite list (who can use the app)', restricted,
    restricted ? 'Only invited people (and owners) can use the app.' : 'Open to anyone with a Google account: every new account can use AI paid from your key.',
    'Set ALLOWED_EMAILS to a comma-separated list of customer emails or @company.com domains (owners in ADMIN_EMAILS are always allowed), then redeploy.');

  const blocking = checks.filter((c) => !c.ok && ['database', 'gmail'].includes(c.id));
  return NextResponse.json({ ok: blocking.length === 0, isAdmin, checks }, { headers: { 'Cache-Control': 'no-store' } });
}
