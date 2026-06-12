// app/api/check-replies/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { google } from 'googleapis';

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
  MAX_EMAILS_TO_CHECK: 50, // Limit to avoid rate limiting
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

    const { userId, accessToken, senderEmail } = await request.json();

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

    // Limit the number of emails to check to avoid rate limiting
    const emailsToCheck = snapshot.docs.slice(0, CONFIG.MAX_EMAILS_TO_CHECK);
    console.log(`[Check Replies] Checking ${emailsToCheck.length} emails (limited from ${snapshot.docs.length})`);

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
    const newReplies = [];

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
          const searchQuery = `to:${senderEmail} from:${toEmail} in:inbox "${subject || ''}"`;
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
              format: 'metadata',
              metadataHeaders: ['from', 'to', 'subject', 'date']
            });

            // Extract reply details
            const headers = {};
            messageDetails.data.payload?.headers?.forEach(header => {
              headers[header.name.toLowerCase()] = header.value;
            });

            console.log(`[Check Replies] Found reply from ${toEmail}:`, headers.from);

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

            // Track company reply (non-blocking)
            fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/mark-replied`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                email: toEmail
              })
            }).catch(trackError => {
              console.warn(`[Check Replies] Failed to track reply for ${toEmail}:`, trackError);
            });
          } else {
            console.log(`[Check Replies] No reply found for ${toEmail}`);
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

    // Log summary
    console.log(`[Check Replies] Checked ${emailsToCheck.length} emails, found ${replyCount} replies, ${errorCount} errors`);

    return NextResponse.json({
      replyCount,
      checked: emailsToCheck.length,
      errors: errorCount,
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
