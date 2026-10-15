// app/api/get-thread/route.js - the whole conversation with one lead, read in FULL.
//
// Which Gmail access is used, in order:
//   1. an access token sent by the page (the person just allowed Gmail), else
//   2. the owner's stored read-only Gmail connection (Account -> Reply watch), else
//   3. what was saved when the reply was found (our email + their reply text), so the conversation and the AI reply assist
//      still work when Gmail cannot be reached.
// (The dashboard's "view conversation" button sends no token at all, so before this it could never load.)
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, isAdminMode } from '../../../lib/server-firestore.js';
import { google } from 'googleapis';
import { readMessage, buildSavedThread } from '../../../lib/server/gmail-message.js';
import { loadConnection, gmailFor } from '../../../lib/server/gmail-connection.js';
import { isGmailAuthError } from '../../../lib/server/reply-check.js';
import { uidFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';

// In-memory thread cache, 5 minute TTL. The key ALWAYS starts with the owner's id: a thread cached for one customer must never be
// served to another who asks about the same address.
const threadCache = new Map();
const THREAD_CACHE_TTL = 5 * 60 * 1000;
const cacheKey = (uid, ref) => `${uid}|${ref}`;
const getCachedThread = (key) => {
  const cached = threadCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) { threadCache.delete(key); return null; }
  return cached.data;
};
const setCachedThread = (key, data) => {
  threadCache.set(key, { data, expiresAt: Date.now() + THREAD_CACHE_TTL });
  if (threadCache.size > 50) {
    const now = Date.now();
    for (const [k, v] of threadCache.entries()) if (now > v.expiresAt) threadCache.delete(k);
  }
};

let app, db;
try {
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
  };
  if (!cfg.apiKey || !cfg.projectId) throw new Error('Missing Firebase env vars');
  app = !getApps().length ? initializeApp(cfg) : getApp();
  db = getFirestore(app);
} catch (configError) {
  console.error('Firebase config error:', configError);
}

const toMs = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : 0; };

/** What was saved about this lead's reply (newest replied email first). */
async function savedThread(uid, email, myEmail) {
  const snap = await getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), where('to', '==', email)));
  const rows = snap.docs.map((d) => d.data()).filter((x) => x.replyText).sort((a, b) => toMs(b.repliedAt) - toMs(a.repliedAt));
  return rows.length ? buildSavedThread(rows[0], { myEmail }) : null;
}

export async function POST(request) {
  try {
    const uid = uidFromRequest(request); // set by proxy.js after verifying the sign-in; never taken from the body
    const { email, messageId, threadId, accessToken } = await request.json().catch(() => ({}));
    if (!uid || !email) return NextResponse.json({ error: 'email required' }, { status: 400, headers: NO_STORE });
    if (!db) return NextResponse.json({ error: 'Firebase not initialized' }, { status: 500, headers: NO_STORE });

    const key = cacheKey(uid, threadId || messageId || String(email).toLowerCase());
    const cached = getCachedThread(key);
    if (cached) return NextResponse.json({ success: true, cached: true, ...cached }, { headers: NO_STORE });

    // 1 / 2: pick the Gmail access.
    let gmail = null;
    let myEmail = String(request.headers.get('x-user-email') || '');
    if (accessToken) {
      const oauth2Client = new google.auth.OAuth2(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || 'http://localhost:3000');
      oauth2Client.setCredentials({ access_token: accessToken });
      gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    } else if (isAdminMode()) {
      const conn = await loadConnection(db, uid).catch(() => null);
      if (conn && conn.status !== 'needs_reconnect') { gmail = gmailFor(conn, uid); myEmail = conn.email || myEmail; }
    }

    let thread = null;
    if (gmail) {
      try {
        let id = threadId;
        if (!id && messageId) id = (await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'minimal' })).data.threadId;
        if (!id) {
          const found = await gmail.users.messages.list({ userId: 'me', q: `from:${email} OR to:${email}`, maxResults: 1 });
          const first = found.data.messages?.[0];
          if (first) id = (await gmail.users.messages.get({ userId: 'me', id: first.id, format: 'minimal' })).data.threadId;
        }
        if (id) {
          const t = await gmail.users.threads.get({ userId: 'me', id, format: 'full' });
          const messages = (t.data.messages || []).map(readMessage).sort((a, b) => new Date(a.date) - new Date(b.date));
          thread = { threadId: t.data.id, messages, totalMessages: messages.length, source: 'gmail' };
        }
      } catch (e) {
        if (!isGmailAuthError(e)) throw e; // a real error: reported below
        // Gmail refused the access: fall through to what was saved.
      }
    }

    // 3: what was saved when the reply was found.
    if (!thread) thread = await savedThread(uid, String(email).toLowerCase(), myEmail).catch(() => null);

    if (!thread) {
      const reason = gmail ? 'No messages found for this address.' : 'Allow Gmail (or turn on Account → Reply watch) to read this conversation. Nothing was saved for it yet.';
      return NextResponse.json({ error: reason, code: gmail ? 'NOT_FOUND' : 'GMAIL_NOT_CONNECTED' }, { status: gmail ? 404 : 401, headers: NO_STORE });
    }

    if (thread.source === 'gmail') setCachedThread(key, thread);
    return NextResponse.json({ success: true, cached: false, ...thread }, { headers: NO_STORE });
  } catch (error) {
    console.error('Get thread error:', error?.message);
    return NextResponse.json({ error: 'Could not load this conversation right now.' }, { status: 500, headers: NO_STORE });
  }
}
