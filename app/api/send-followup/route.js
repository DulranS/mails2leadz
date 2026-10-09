// app/api/send-followup/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, where, getDocs, updateDoc, doc, increment } from '../../../lib/server-firestore.js';
import { google } from 'googleapis';
import { headerSafe, pickOriginal, isLostDeal } from '../../../lib/server/route-helpers.js';

// ============================================================================
// FIREBASE CONFIGURATION WITH ERROR HANDLING
// ============================================================================
const requiredEnvVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
}

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
  MAX_FOLLOW_UPS: 3,
  MIN_DAYS_BETWEEN_FOLLOWUP: 2,
  CAMPAIGN_WINDOW_DAYS: 30
};

// ============================================================================
// FOLLOW-UP TEMPLATES
// ============================================================================
const FOLLOW_UP_TEMPLATES = [
  {
    subject: 'Quick question for {{business_name}}',
    body: `Hi {{business_name}},\n\nJust circling back in case my last note got buried. Is this something you'd like to talk about, or is the timing not right?\n\nEither answer is fine, and a one-word reply is plenty.\n\nBest,\n{{sender_name}}`
  },
  {
    subject: '{{business_name}}, still interested?',
    body: `Hi {{business_name}},\n\nI know inboxes get busy, so I'll keep this short. If a quick call or a few more details would help, just tell me what would be most useful and I'll send it over.\n\nThanks,\n{{sender_name}}`
  },
  {
    subject: 'Closing the loop',
    body: `Hi {{business_name}},\n\nI'll stop here so I don't clutter your inbox. If things change, or you'd like to pick this up later, just reply and I'll be happy to help.\n\nWishing you all the best,\n{{sender_name}}`
  }
];

// ============================================================================
// EXTRACT DOMAIN FROM EMAIL
// ============================================================================
const extractDomainFromEmail = (email) => {
  if (!email || typeof email !== 'string') return null;
  const parts = email.trim().toLowerCase().split('@');
  return parts.length === 2 ? parts[1] : null;
};

// Helper function to encode subject line using RFC 2047 encoded-word syntax
const encodeSubject = (subject) => {
  if (!subject) return '';
  // Check if subject contains non-ASCII characters
  if (/[\x80-\xFF]/.test(subject)) {
    // Encode using UTF-8 base64
    const encoded = Buffer.from(subject, 'utf-8').toString('base64');
    return `=?utf-8?B?${encoded}?=`;
  }
  return subject;
};

const createMimeMessage = ({ from, to, subject, body, attachments = [] }) => {
  // From is optional: when no sender address is configured Gmail uses the signed-in account.
  // Every header value is forced onto one line (an AI/user-written subject must never be able to add headers).
  let message = `${from ? `From: ${headerSafe(from)}\r\n` : ''}To: ${headerSafe(to)}\r\nSubject: ${encodeSubject(headerSafe(subject))}\r\nMIME-Version: 1.0\r\n`;

  if (attachments.length > 0) {
    const boundary = 'boundary_' + Math.random().toString(36).substr(2, 16);
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
    message += `${body}\r\n`;

    attachments.forEach((attachment, index) => {
      message += `--${boundary}\r\n`;
      message += `Content-Type: ${attachment.mimeType || 'application/octet-stream'}\r\n`;
      message += `Content-Transfer-Encoding: base64\r\n`;
      message += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n\r\n`;
      message += `${attachment.data}\r\n`;
    });

    message += `--${boundary}--\r\n`;
  } else {
    message += `Content-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
  }

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
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
    if (!app || !db) {
      return NextResponse.json(
        { 
          error: 'Firebase not properly initialized',
          details: 'Missing or invalid Firebase configuration',
          code: 'FIREBASE_ERROR'
        },
        { status: 500, headers }
      );
    }
    
    if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || !(process.env.GOOGLE_CLIENT_SECRET || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET)) {
      return NextResponse.json(
        { 
          error: 'Google/Gmail configuration missing',
          details: 'Missing Google OAuth or Gmail configuration',
          code: 'CONFIG_ERROR'
        },
        { status: 500, headers }
      );
    }
    
    const payload = await request.json();
    const { accessToken, senderName, attachments = [] } = payload;
    const email = String(payload.email || '').trim().toLowerCase();
    // The verified user (set by proxy.js) wins over anything in the body.
    const userId = request.headers.get('x-user-id') || payload.userId;
    // Approved AI/custom wording: plain strings only, bounded size.
    const customTemplates = Array.isArray(payload.customTemplates)
      ? payload.customTemplates
          .filter((t) => t && typeof t.subject === 'string' && typeof t.body === 'string')
          .slice(0, 3)
          .map((t) => ({ subject: t.subject.slice(0, 200), body: t.body.slice(0, 5000) }))
      : null;
    
    if (!email || !accessToken || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields', code: 'MISSING_FIELDS' },
        { status: 400, headers }
      );
    }
    
    const existingQuery = query(
      collection(db, 'sent_emails'),
      where('userId', '==', userId),
      where('to', '==', email)
    );
    const existingSnapshot = await getDocs(existingQuery);
    
    if (existingSnapshot.empty) {
      return NextResponse.json(
        { error: 'No original email found', code: 'NO_ORIGINAL_EMAIL' },
        { status: 404, headers }
      );
    }
    
    // Several rows can exist for one lead (re-sends): use the one that carries the follow-up counter.
    const picked = pickOriginal(existingSnapshot.docs);
    const existingDoc = picked.doc;
    const existingData = picked.data;
    
    if (existingSnapshot.docs.some((d) => d.data().replied === true)) {
      return NextResponse.json(
        { error: 'Lead has already replied. Loop closed.', code: 'ALREADY_REPLIED' },
        { status: 400, headers }
      );
    }
    
    if (await isLostDeal(db, userId, email)) {
      return NextResponse.json(
        { error: 'This deal is marked Lost, so no more follow-ups are sent. Reopen the deal to contact them again.', code: 'DEAL_LOST' },
        { status: 409, headers }
      );
    }

    const followUpCount = existingData.followUpCount ?? existingData.followUpSentCount ?? 0;
    if (followUpCount >= CONFIG.MAX_FOLLOW_UPS) {
      return NextResponse.json(
        { error: `Maximum follow-ups (${CONFIG.MAX_FOLLOW_UPS}) reached. Loop closed.`, code: 'MAX_FOLLOWUPS_REACHED' },
        { status: 400, headers }
      );
    }
    
    // Helper function to safely convert timestamp to Date
    const safeToDate = (timestamp) => {
      if (!timestamp) return new Date();
      if (typeof timestamp?.toDate === 'function') {
        return timestamp.toDate();
      } else if (timestamp instanceof Date) {
        return timestamp;
      } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        return new Date(timestamp);
      } else {
        return new Date();
      }
    };
    
    const lastFollowUpAt = existingData.lastFollowUpAt ? 
      safeToDate(existingData.lastFollowUpAt) :
      existingData.lastFollowUpSentAt ? safeToDate(existingData.lastFollowUpSentAt) :
      safeToDate(existingData.sentAt);
    
    const daysSinceLastContact = (new Date() - lastFollowUpAt) / (1000 * 60 * 60 * 24);
    if (daysSinceLastContact < CONFIG.MIN_DAYS_BETWEEN_FOLLOWUP) {
      return NextResponse.json(
        { error: `Too soon to follow up. Wait ${Math.ceil(CONFIG.MIN_DAYS_BETWEEN_FOLLOWUP - daysSinceLastContact)} more days.`, code: 'TOO_SOON' },
        { status: 400, headers }
      );
    }
    
    const followUpIndex = followUpCount;
    const templatesToUse = customTemplates && customTemplates.length > 0 ? customTemplates : FOLLOW_UP_TEMPLATES;
    const template = templatesToUse[followUpIndex] || templatesToUse[templatesToUse.length - 1];
    
    let subject = template.subject.replace('{{business_name}}', existingData.businessName || 'Contact');
    let body = template.body
      .replace('{{business_name}}', existingData.businessName || 'Contact')
      .replace('{{sender_name}}', senderName || 'Team');
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      (process.env.GOOGLE_CLIENT_SECRET || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET),
      process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || 'http://localhost:3000'
    );
    
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    const rawMessage = createMimeMessage({
      from: process.env.GMAIL_SENDER_EMAIL ? `${headerSafe(senderName) || 'Team'} <${process.env.GMAIL_SENDER_EMAIL}>` : '',
      to: email,
      subject,
      body,
      attachments
    });
    
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawMessage }
    });
    
    const newFollowUpCount = followUpCount + 1;
    const now = new Date().toISOString();
    
    await updateDoc(doc(db, 'sent_emails', existingDoc.id), {
      followUpCount: newFollowUpCount,
      followUpSentCount: newFollowUpCount,
      lastFollowUpAt: now,
      lastFollowUpSentAt: now,
      followUpDates: [...(existingData.followUpDates || []), now],
      followUpAt: newFollowUpCount < CONFIG.MAX_FOLLOW_UPS ? (() => {
        const daysToAdd = newFollowUpCount === 1 ? 2 : newFollowUpCount === 2 ? 5 : 10;
        return new Date(new Date(now).getTime() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();
      })() : null
    });
    
    // Track company followup
    try {
      const domain = extractDomainFromEmail(email);
      const authHeader = request.headers.get('authorization');
      await fetch(`${new URL(request.url).origin}/api/track-company`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeader ? { Authorization: authHeader } : {}) },
        body: JSON.stringify({
          userId,
          companyName: existingData.businessName || 'Unknown Company',
          domain,
          email,
          contactName: existingData.contactName || '',
          csvSource: existingData.csvSource || 'unknown',
          action: 'followup'
        })
      });
    } catch (trackError) {
      console.warn('Failed to track company followup:', trackError);
      // Don't fail the followup send if company tracking fails
    }
    
    const isFinalFollowUp = newFollowUpCount >= CONFIG.MAX_FOLLOW_UPS;
    
    return NextResponse.json({
      success: true,
      followUpCount: newFollowUpCount,
      messageId: response.data.id,
      isFinalFollowUp,
      loopClosed: isFinalFollowUp
    }, { headers });
    
  } catch (error) {
    console.error('Send follow-up error:', error);
    
    if (error.code === 401 || error.message?.includes('invalid_grant')) {
      return NextResponse.json(
        { 
          error: 'Gmail access token expired or invalid',
          details: 'Please re-authenticate with Gmail',
          code: 'GMAIL_AUTH_ERROR'
        },
        { status: 401, headers }
      );
    }
    
    if (error.code === 403 || error.message?.includes('insufficient_permissions')) {
      return NextResponse.json(
        { 
          error: 'Insufficient Gmail permissions',
          details: 'Please grant Gmail send permissions',
          code: 'GMAIL_PERMISSIONS_ERROR'
        },
        { status: 403, headers }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to send follow-up',
        details: error.message,
        code: 'SEND_ERROR'
      },
      { status: 500, headers }
    );
  }
}