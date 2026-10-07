// app/api/system-check/route.js
// "Why isn't it working?" in one click. Runs the same operations real requests depend on and
// reports ok / not ok per area. Any signed-in user can run it; the exact fix instructions
// (which name configuration variables) are shown only to ADMIN_EMAILS.
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, deleteDoc, isAdminMode } from '../../../lib/server-firestore.js';
import { aiConfig } from '../../../lib/ai-client.js';

export const maxDuration = 30;

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
    add('database', 'Database (server access)', ok, ok ? (isAdminMode() ? 'Working (full server access).' : 'Working (limited mode).') : 'Wrote but could not read back.',
      'Check the Firestore project id and that rules are deployed.');
    if (ok && !isAdminMode()) {
      add('admin', 'Server credentials', false, 'Running without a service account. This is the less secure mode.',
        'Set FIREBASE_SERVICE_ACCOUNT_JSON in your hosting environment variables (Firebase console > Project settings > Service accounts > Generate new private key), then redeploy.');
    } else if (ok) {
      add('admin', 'Server credentials', true, 'Service account active.');
    }
  } catch (e) {
    const denied = /permission|insufficient/i.test(e.message || '');
    add('database', 'Database (server access)', false, denied ? 'The server is not allowed to write to your database.' : e.message,
      denied
        ? 'Your Firestore rules are locked down but the server has no service account. Set FIREBASE_SERVICE_ACCOUNT_JSON in your hosting environment variables (paste the downloaded JSON key), then redeploy.'
        : 'Check the NEXT_PUBLIC_FIREBASE_* variables match your Firebase project.');
  }

  // 2. Gmail sending (Google sign-in client)
  const gid = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const gsec = !!(process.env.GOOGLE_CLIENT_SECRET || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET);
  add('gmail', 'Email sending (Gmail)', gid && gsec,
    gid && gsec ? 'Google client configured.' : `Missing: ${[!gid && 'client id', !gsec && 'client secret'].filter(Boolean).join(', ')}.`,
    'Set NEXT_PUBLIC_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (Google Cloud > Credentials), enable the Gmail API, then redeploy.');

  // 3. AI
  const ai = aiConfig();
  add('ai', 'AI drafting', !!ai.provider, ai.provider ? `Using ${ai.provider} (${ai.models.fast}).` : 'No AI key configured.',
    'Set OPENAI_API_KEY (or ANTHROPIC_API_KEY), then redeploy. Everything except AI drafting works without it.');

  // 4. Webhooks (only matters if SMS/calls are used)
  add('webhooks', 'SMS/call webhook protection', !!process.env.WEBHOOK_SECRET, process.env.WEBHOOK_SECRET ? 'Protected.' : 'No webhook secret set.',
    'Set WEBHOOK_SECRET to a long random string and add ?key=<it> to your Twilio webhook URLs. Skip if you do not use SMS replies.');

  const blocking = checks.filter((c) => !c.ok && ['database', 'gmail'].includes(c.id));
  return NextResponse.json({ ok: blocking.length === 0, isAdmin, checks }, { headers: { 'Cache-Control': 'no-store' } });
}
