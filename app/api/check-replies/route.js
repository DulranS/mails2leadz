// app/api/check-replies/route.js - "did anyone answer?" for the signed-in owner, using the Gmail token of the person who is here now.
// The loop itself lives in lib/server/reply-check.js (shared with the timed job, app/api/cron/check-replies). It reads each reply in FULL.
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from '../../../lib/server-firestore.js';
import { google } from 'googleapis';
import { REPLY_CHECK_BATCH } from '../../../lib/reply-sync.js';
import { runReplyCheck, GmailAuthError } from '../../../lib/server/reply-check.js';

export const maxDuration = 60; // up to REPLY_CHECK_BATCH Gmail look-ups per call

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
};

let app;
let db;
try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
} catch (error) {
  console.error('Firebase initialization error:', error);
}

const isValidEmail = (email) => typeof email === 'string' && email.trim().length >= 5 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export async function POST(request) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' };

  try {
    if (!app || !db) {
      console.warn('[Check Replies] Firebase not initialized, skipping');
      return NextResponse.json({ error: 'Firebase not properly initialized', details: 'Missing or invalid Firebase configuration', replyCount: 0 }, { status: 200, headers }); // 200 so the UI keeps working
    }

    const { userId, accessToken, senderEmail } = await request.json();
    if (!userId || !accessToken || !senderEmail) {
      return NextResponse.json({ error: 'Missing required fields: userId, accessToken, or senderEmail', replyCount: 0 }, { status: 400, headers });
    }
    if (!isValidEmail(senderEmail)) {
      return NextResponse.json({ error: 'Invalid sender email format', replyCount: 0 }, { status: 400, headers });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Company tracking needs the caller's own sign-in (every /api route is gated), so it is forwarded as-is.
    const authHeader = request.headers.get('authorization');
    const origin = new URL(request.url).origin;
    const trackReply = (payload) => fetch(`${origin}/api/track-company`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authHeader ? { Authorization: authHeader } : {}) },
      body: JSON.stringify(payload),
    });

    const r = await runReplyCheck({ db, gmail, userId, senderEmail, trackReply, max: REPLY_CHECK_BATCH });
    console.log(`[Check Replies] Checked ${r.checked}, found ${r.replyCount} replies, ${r.errors} errors`);
    return NextResponse.json({
      replyCount: r.replyCount,
      checked: r.checked,
      eligible: r.eligible,
      waiting: r.waiting, // unreplied emails from the last 60 days that this call did not get to: call again to continue
      errors: r.errors,
      bounced: r.bounced,
      autoReplies: r.autoReplies,
      triage: r.triage,
      replies: r.replies,
    }, { headers });
  } catch (error) {
    if (error instanceof GmailAuthError) {
      // The Gmail permission ran out: say so (the dashboard asks for it again) instead of reporting "0 replies" as if all is well.
      return NextResponse.json({ error: 'Gmail access expired. Please allow Gmail again and retry.', code: 'GMAIL_AUTH', replyCount: 0, checked: 0, errors: 1 }, { status: 200, headers });
    }
    console.error('[Check Replies] Fatal error:', error);
    return NextResponse.json({ error: 'Failed to check for replies', details: error.message, replyCount: 0, checked: 0, errors: 1 }, { status: 200, headers }); // 200 so the UI keeps working
  }
}
