// app/api/check-replies/route.js
import { NextResponse } from 'next/server';
import { identify } from '../../../lib/server/route-helpers.js';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, isAdminMode } from '../../../lib/server-firestore.js';
import { hardBounceRecipients } from '../../../lib/server/bounces.js';
import { suppressContact } from '../../../lib/server/suppress.js';
import { google } from 'googleapis';
import { cancelPendingFollowUps, pickEmailsToCheck, REPLY_CHECK_BATCH } from '../../../lib/reply-sync.js';
import { triageReply } from '../../../lib/server/reply-triage.js';
import { loadAutopilot } from '../../../lib/server/prepare-drafts.js';
import { quickIntent, ownWords } from '../../../lib/reply-intents.js';
import { extractPlainText } from '../../../lib/gmail-text.js';

export const maxDuration = 60; // up to REPLY_CHECK_BATCH Gmail look-ups per call

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================
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

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  MAX_EMAILS_TO_CHECK: REPLY_CHECK_BATCH, // Limit per call to avoid rate limiting; successive calls rotate through the rest
  RATE_LIMIT_DELAY_MS: 100, // Delay between Gmail API calls
  MAX_RETRIES: 2 // Retry failed Gmail API calls
};

// ============================================================================
// VALIDATE EMAIL
// ============================================================================
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const cleaned = email.trim().toLowerCase();
  if (cleaned.length < 5) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(cleaned);
};

// ============================================================================
// POST HANDLER
// ============================================================================
export async function POST(request) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };

  try {
    console.log('[Check Replies] Starting reply check...');

    // Check Firebase initialization
    if (!app || !db) {
      console.warn('[Check Replies] Firebase not initialized, skipping');
      return NextResponse.json(
        {
          error: 'Firebase not properly initialized',
          details: 'Missing or invalid Firebase configuration',
          replyCount: 0
        },
        { status: 200, headers } // Return 200 to not break the UI
      );
    }

    const { userId: claimedUserId, accessToken, senderEmail } = await request.json();
    const who = identify(request, claimedUserId);
    if (who.response) return who.response;
    const userId = who.uid;

    console.log('[Check Replies] Request params:', { userId: !!userId, accessToken: !!accessToken, senderEmail });

    if (!userId || !accessToken || !senderEmail) {
      console.error('[Check Replies] Missing required fields');
      return NextResponse.json(
        { error: 'Missing required fields: userId, accessToken, or senderEmail', replyCount: 0 },
        { status: 400, headers }
      );
    }

    // Validate sender email
    if (!isValidEmail(senderEmail)) {
      return NextResponse.json(
        { error: 'Invalid sender email format', replyCount: 0 },
        { status: 400, headers }
      );
    }

    // Get sent emails that haven't been replied to yet
    const q = query(
      collection(db, 'sent_emails'),
      where('userId', '==', userId),
      where('replied', '==', false)
    );
    const snapshot = await getDocs(q);

    console.log(`[Check Replies] Found ${snapshot.docs.length} sent emails to check`);

    if (snapshot.empty) {
      console.log('[Check Replies] No sent emails found to check');
      return NextResponse.json({ replyCount: 0 }, { headers });
    }

    // Limit the number of emails per call (rate limits), but ROTATE: never-checked and longest-ago-checked first, newest first,
    // last 60 days only. (Taking the first 50 in storage order re-checked the same 50 forever and never saw other replies.)
    const { picked, eligible, waiting } = pickEmailsToCheck(
      snapshot.docs.map((d) => ({ d, sentAt: d.data().sentAt, replyCheckedAt: d.data().replyCheckedAt })),
      Date.now(),
      { max: CONFIG.MAX_EMAILS_TO_CHECK }
    );
    const emailsToCheck = picked.map((x) => x.d);
    console.log(`[Check Replies] Checking ${emailsToCheck.length} emails (${eligible} eligible, ${waiting} waiting for the next call)`);
    if (emailsToCheck.length === 0) {
      return NextResponse.json({ replyCount: 0, checked: 0, eligible: 0, waiting: 0 }, { headers });
    }

    // Set up Gmail API
    const oauth2Client = new google.auth.OAuth2(
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET,
      process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    let replyCount = 0;
    let errorCount = 0;
    let autoReplies = 0;
    const newReplies = [];
    const triage = []; // what each new reply means and what the app did about it (see lib/server/reply-triage.js)
    const apSettings = isAdminMode() ? await loadAutopilot(db, userId) : null;

    // Check each sent email for replies with retry logic
    for (const doc of emailsToCheck) {
      const sentEmail = doc.data();
      const toEmail = sentEmail.to;
      const subject = sentEmail.subject;
      const threadId = sentEmail.threadId;
      const messageId = sentEmail.messageId;

      console.log(`[Check Replies] Checking email: ${toEmail}`);

      // Validate recipient email
      if (!isValidEmail(toEmail)) {
        console.warn(`[Check Replies] Invalid recipient email: ${toEmail}`);
        continue;
      }

      let success = false;
      for (let attempt = 0; attempt < CONFIG.MAX_RETRIES && !success; attempt++) {
        try {
          // Search for replies in Gmail
          // Quotes/backslashes inside the subject would break the Gmail search phrase and silently hide the reply.
          const safeSubject = String(subject || '').replace(/["\\\r\n]+/g, ' ').trim();
          const searchQuery = `to:${senderEmail} from:${toEmail} in:inbox "${safeSubject}"`;
          console.log(`[Check Replies] Search query: ${searchQuery}`);
          
          const response = await gmail.users.messages.list({
            userId: 'me',
            q: searchQuery,
            maxResults: 1
          });

          console.log(`[Check Replies] Gmail response for ${toEmail}:`, response.data.messages?.length || 0, 'messages');

          if (response.data.messages && response.data.messages.length > 0) {
            const replyMessage = response.data.messages[0];

            // Get message details
            const messageDetails = await gmail.users.messages.get({
              userId: 'me',
              id: replyMessage.id,
              format: 'full' // the whole message, so the reply is READ properly instead of guessed from Gmail's ~200 character preview
            });

            // Extract reply details
            const headers = {};
            messageDetails.data.payload?.headers?.forEach(header => {
              headers[header.name.toLowerCase()] = header.value;
            });

            console.log(`[Check Replies] Found reply from ${toEmail}:`, headers.from);

            // An out-of-office / automatic answer is not a reply: do not stop the follow-ups or inflate the reply rate.
            // The message is remembered so the next check does not pick it up again; a REAL reply later is a different message.
            // What the person wrote THEMSELVES (the quoted original, which contains our own footer, is cut off); the preview is the fallback.
            const snippet = ownWords(extractPlainText(messageDetails.data.payload)).trim() || ownWords(String(messageDetails.data.snippet || '')).trim();
            const stampChecked = () => updateDoc(doc.ref, { replyCheckedAt: new Date().toISOString() }).catch(() => {}); // so the rotation moves on
            if (sentEmail.autoReplyMessageId === replyMessage.id) { await stampChecked(); success = true; break; }
            if (quickIntent(`${headers.subject || ''} ${snippet}`) === 'out_of_office') {
              await updateDoc(doc.ref, { autoReplyMessageId: replyMessage.id, autoReplyAt: new Date().toISOString(), replyCheckedAt: new Date().toISOString() });
              autoReplies++;
              success = true;
              break;
            }

            // Found a reply - update Firebase
            await updateDoc(doc.ref, {
              replied: true,
              repliedAt: new Date().toISOString(),
              followUpAt: null, // Cancel scheduled follow-ups
              replyMessageId: replyMessage.id,
              replyThreadId: messageDetails.data.threadId,
              replyFrom: headers.from,
              replyDate: headers.date,
              replySubject: headers.subject
            });

            replyCount++;
            console.log(`✅ Reply detected from ${toEmail}`);

            // Add to new replies list
            newReplies.push({
              email: toEmail,
              threadId: messageDetails.data.threadId,
              messageId: replyMessage.id,
              replyCount: 1,
              lastReplyAt: new Date().toISOString(),
              replyFrom: headers.from,
              replySubject: headers.subject,
              originalSubject: subject
            });

            // Stop chasing: cancel pending follow-up reminders for this lead.
            await cancelPendingFollowUps(db, userId, toEmail);

            // Read the reply: opt-out wording is suppressed, a positive reply moves the deal forward (never sends anything).
            if (isAdminMode()) {
              const t = await triageReply(db, { uid: userId, sentRef: doc.ref, email: toEmail, businessName: sentEmail.businessName, replyText: `${headers.subject || ''}\n${snippet}`, originalSubject: subject, settings: apSettings });
              if (t) triage.push(t);
            }

            // Track company reply (non-blocking; forward the caller's token, /api is auth-gated)
            const authHeader = request.headers.get('authorization');
            fetch(`${new URL(request.url).origin}/api/track-company`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(authHeader ? { Authorization: authHeader } : {}) },
              body: JSON.stringify({
                userId,
                companyName: sentEmail.businessName || 'Unknown Company',
                domain: String(toEmail).split('@')[1] || null,
                email: toEmail,
                contactName: sentEmail.contactName || '',
                csvSource: sentEmail.csvSource || 'unknown',
                action: 'reply'
              })
            }).catch(trackError => {
              console.warn(`[Check Replies] Failed to track reply for ${toEmail}:`, trackError);
            });
          } else {
            console.log(`[Check Replies] No reply found for ${toEmail}`);
            // Remember we looked, so the next call moves on to emails that have not been looked at (best effort).
            try { await updateDoc(doc.ref, { replyCheckedAt: new Date().toISOString() }); } catch { /* never fails the check */ }
          }

          success = true;
        } catch (emailError) {
          console.error(`[Check Replies] Error checking email ${toEmail} (attempt ${attempt + 1}):`, emailError);
          errorCount++;

          // If this is the last attempt, continue to next email
          if (attempt === CONFIG.MAX_RETRIES - 1) {
            console.warn(`[Check Replies] Giving up on ${toEmail} after ${CONFIG.MAX_RETRIES} attempts`);
          } else {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY_MS));
          }
        }
      }

      // Rate limiting between emails
      if (emailsToCheck.indexOf(doc) < emailsToCheck.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY_MS));
      }
    }

    // Bounces: a notice from the mail system saying an address does not exist. Suppress it so we never mail it again
    // (repeated mail to dead addresses hurts the customer's own Gmail sending reputation). Best effort: never fails the check.
    const bounced = [];
    try {
      if (isAdminMode()) {
        const ours = [...new Set(emailsToCheck.map((d) => String(d.data().to || '').toLowerCase()).filter(Boolean))];
        const list = await gmail.users.messages.list({ userId: 'me', q: 'from:(mailer-daemon OR postmaster) newer_than:14d', maxResults: 15 });
        for (const m of list.data.messages || []) {
          const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['subject'] });
          for (const addr of hardBounceRecipients(msg.data.snippet, ours)) {
            if (bounced.includes(addr)) continue;
            await suppressContact(db, { uid: userId, email: addr, reason: 'bounced', source: 'bounce' });
            bounced.push(addr);
          }
        }
      }
    } catch (bounceError) {
      console.warn('[Check Replies] bounce scan skipped:', bounceError?.message);
    }

    // Log summary
    console.log(`[Check Replies] Checked ${emailsToCheck.length} emails, found ${replyCount} replies, ${errorCount} errors`);

    return NextResponse.json({
      replyCount,
      checked: emailsToCheck.length,
      eligible,
      waiting, // unreplied emails from the last 60 days that this call did not get to: call again to continue
      errors: errorCount,
      bounced,
      autoReplies,
      triage,
      replies: newReplies
    }, { headers });

  } catch (error) {
    console.error('[Check Replies] Fatal error:', error);

    // Return 200 with error details to not break the UI
    return NextResponse.json(
      {
        error: 'Failed to check for replies',
        details: error.message,
        replyCount: 0,
        checked: 0,
        errors: 1
      },
      { status: 200, headers }
    );
  }
}
