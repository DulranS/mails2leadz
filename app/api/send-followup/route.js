// app/api/send-followup/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, where, getDocs, updateDoc, doc, increment } from 'firebase/firestore';
import { google } from 'googleapis';

// ============================================================================
// FIREBASE CONFIGURATION WITH ERROR HANDLING
// ============================================================================
const requiredEnvVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
  'NEXT_PUBLIC_GOOGLE_CLIENT_SECRET',
  'GMAIL_SENDER_EMAIL'
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
    body: `Hi {{business_name}},\n\nJust circling back—did my note about outsourced dev & ops support land at a bad time?\n\nNo pressure at all, but if you're ever swamped with web, automation, or backend work and need a reliable extra hand, we're ready to help.\n\nBest,\n{{sender_name}}`
  },
  {
    subject: '{{business_name}}, a quick offer (no strings)',
    body: `Hi again,\n\nI noticed you haven't had a chance to reply—totally understand!\n\nTo make this zero-risk: I'll audit one of your digital workflows for free and send 2–3 actionable automation ideas you can implement immediately.\n\nInterested? Hit "Yes" or reply with a workflow you'd like optimized.\n\nCheers,\n{{sender_name}}`
  },
  {
    subject: 'Closing the loop',
    body: `Hi {{business_name}},\n\nI'll stop emailing after this one!\n\nJust wanted to say: if outsourcing ever becomes a priority, we're here. Many of our clients started with a tiny task and now work with us monthly.\n\nEither way, keep crushing it!\n\n— {{sender_name}}`
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

const createMimeMessage = ({ from, to, subject, body }) => {
  const message = `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
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
    
    if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET || !process.env.GMAIL_SENDER_EMAIL) {
      return NextResponse.json(
        { 
          error: 'Google/Gmail configuration missing',
          details: 'Missing Google OAuth or Gmail configuration',
          code: 'CONFIG_ERROR'
        },
        { status: 500, headers }
      );
    }
    
    const { email, accessToken, userId, senderName } = await request.json();
    
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
    
    const existingDoc = existingSnapshot.docs[0];
    const existingData = existingDoc.data();
    
    if (existingData.replied) {
      return NextResponse.json(
        { error: 'Lead has already replied. Loop closed.', code: 'ALREADY_REPLIED' },
        { status: 400, headers }
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
    const template = FOLLOW_UP_TEMPLATES[followUpIndex] || FOLLOW_UP_TEMPLATES[FOLLOW_UP_TEMPLATES.length - 1];
    
    let subject = template.subject.replace('{{business_name}}', existingData.businessName || 'Contact');
    let body = template.body
      .replace('{{business_name}}', existingData.businessName || 'Contact')
      .replace('{{sender_name}}', senderName || 'Team');
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET,
      process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || 'http://localhost:3000'
    );
    
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    const rawMessage = createMimeMessage({
      from: `${senderName || 'Team'} <${process.env.GMAIL_SENDER_EMAIL}>`,
      to: email,
      subject,
      body
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
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/track-company`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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