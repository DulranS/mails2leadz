// app/api/send-new-leads/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { google } from 'googleapis';

// ============================================================================
// FIREBASE CONFIGURATION WITH ERROR HANDLING
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
  MAX_DAILY_EMAILS: 500,
  RATE_LIMIT_DELAY_MS: 200
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
// CREATE MIME MESSAGE
// ============================================================================
const createMimeMessage = ({ from, to, subject, body, images = [], attachments = [] }) => {
  const mixedBoundary = 'mixed_' + Date.now();
  const relatedBoundary = 'related_' + Date.now();
  
  let mimeMessage = `From: ${from}\r\n`;
  mimeMessage += `To: ${to}\r\n`;
  mimeMessage += `Subject: ${subject}\r\n`;
  mimeMessage += `MIME-Version: 1.0\r\n`;
  mimeMessage += `Content-Type: multipart/mixed; boundary="${mixedBoundary}"\r\n\r\n`;
  
  let htmlBody = body.replace(/\n/g, '<br>');
  images.forEach((img, index) => {
    const cid = img.cid || `img${index + 1}@massmailer`;
    htmlBody = htmlBody.replace(`{{image${index + 1}}}`, `<img src="cid:${cid}" style="max-width: 100%;" />`);
  });
  
  mimeMessage += `--${mixedBoundary}\r\n`;
  if (images.length > 0) {
    mimeMessage += `Content-Type: multipart/related; boundary="${relatedBoundary}"\r\n\r\n`;
    mimeMessage += `--${relatedBoundary}\r\n`;
    mimeMessage += `Content-Type: text/html; charset=UTF-8\r\n`;
    mimeMessage += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
    mimeMessage += htmlBody + '\r\n\r\n';
    
    for (const img of images) {
      mimeMessage += `--${relatedBoundary}\r\n`;
      mimeMessage += `Content-Type: ${img.mimeType}\r\n`;
      mimeMessage += `Content-Transfer-Encoding: base64\r\n`;
      mimeMessage += `Content-ID: <${img.cid}>\r\n`;
      mimeMessage += `Content-Disposition: inline; filename="${img.filename || `image${images.indexOf(img) + 1}`}"\r\n\r\n`;
      mimeMessage += img.base64 + '\r\n\r\n';
    }
    
    mimeMessage += `--${relatedBoundary}--\r\n`;
  } else {
    mimeMessage += `Content-Type: text/html; charset=UTF-8\r\n`;
    mimeMessage += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
    mimeMessage += htmlBody + '\r\n\r\n';
  }
  
  for (const attachment of attachments) {
    mimeMessage += `--${mixedBoundary}\r\n`;
    mimeMessage += `Content-Type: ${attachment.mimeType || 'application/octet-stream'}; name="${attachment.filename}"\r\n`;
    mimeMessage += `Content-Transfer-Encoding: base64\r\n`;
    mimeMessage += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n\r\n`;
    mimeMessage += attachment.base64 + '\r\n\r\n';
  }
  
  mimeMessage += `--${mixedBoundary}--\r\n`;
  
  return Buffer.from(mimeMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
    // Check Firebase initialization
    if (!app || !db) {
      return NextResponse.json(
        { 
          error: 'Firebase not properly initialized',
          details: 'Missing or invalid Firebase configuration'
        },
        { status: 500, headers }
      );
    }
    
    const {
      recipients,
      senderName,
      senderEmail,
      fieldMappings,
      accessToken,
      template,
      userId,
      emailImages = [],
      emailAttachments = []
    } = await request.json();
    
    if (!userId || !accessToken || !recipients || !Array.isArray(recipients)) {
      return NextResponse.json(
        { error: 'Missing or invalid required fields' },
        { status: 400, headers }
      );
    }
    
    // Check daily limit
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const emailQuery = query(
      collection(db, 'sent_emails'),
      where('userId', '==', userId),
      where('sentAt', '>=', startOfDay)
    );
    const emailSnapshot = await getDocs(emailQuery);
    
    const remainingQuota = CONFIG.MAX_DAILY_EMAILS - emailSnapshot.size;
    
    if (remainingQuota <= 0) {
      return NextResponse.json(
        {
          error: 'Daily email limit reached',
          dailyCount: emailSnapshot.size,
          limit: CONFIG.MAX_DAILY_EMAILS,
          remainingToday: 0
        },
        { status: 429, headers }
      );
    }
    
    // Filter to only new leads (not already sent)
    const newRecipients = [];
    for (const recipient of recipients) {
      const email = recipient.email?.trim().toLowerCase();
      if (!isValidEmail(email)) continue;
      
      const existingQuery = query(
        collection(db, 'sent_emails'),
        where('userId', '==', userId),
        where('to', '==', email)
      );
      const existingSnapshot = await getDocs(existingQuery);
      
      if (existingSnapshot.empty) {
        newRecipients.push(recipient);
      }
    }
    
    // Limit by quota
    const recipientsToSend = newRecipients.slice(0, remainingQuota);
    
    // Setup Gmail API
    const oauth2Client = new google.auth.OAuth2(
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET,
      process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI
    );
    
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    
    for (const recipient of recipientsToSend) {
      const email = recipient.email.trim().toLowerCase();
      const businessName = recipient.business_name || recipient.business || 'Contact';
      
      // Render template
      let subject = template.subject;
      let body = template.body;
      
      Object.entries(fieldMappings || {}).forEach(([varName, col]) => {
        const regex = new RegExp(`{{\\s*${varName}\\s*}}`, 'g');
        if (varName === 'sender_name') {
          subject = subject.replace(regex, senderName || 'Team');
          body = body.replace(regex, senderName || 'Team');
        } else if (recipient[col]) {
          subject = subject.replace(regex, recipient[col]);
          body = body.replace(regex, recipient[col]);
        }
      });
      
      try {
        const rawMessage = createMimeMessage({
          from: `${senderName} <${senderEmail}>`,
          to: email,
          subject,
          body,
          images: emailImages,
          attachments: emailAttachments
        });
        
        const response = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: rawMessage }
        });
        
        await addDoc(collection(db, 'sent_emails'), {
          userId,
          to: email,
          businessName,
          subject,
          body,
          template: 'A',
          sentAt: new Date().toISOString(),
          opened: false,
          openedCount: 0,
          clicked: false,
          clickCount: 0,
          replied: false,
          followUpCount: 0,
          followUpSentCount: 0,
          followUpAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          lastFollowUpAt: null,
          lastFollowUpSentAt: null,
          followUpDates: [],
          messageId: response.data.id,
          threadId: response.data.threadId
        });
        
        sentCount++;
        await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY_MS));
        
      } catch (error) {
        console.error(`Failed to send to ${email}:`, error);
        failedCount++;
      }
    }
    
    const newDailyCount = emailSnapshot.size + sentCount;
    
    return NextResponse.json({
      sent: sentCount,
      failed: failedCount,
      skipped: skippedCount,
      total: recipientsToSend.length,
      dailyCount: newDailyCount,
      limit: CONFIG.MAX_DAILY_EMAILS,
      remainingToday: CONFIG.MAX_DAILY_EMAILS - newDailyCount
    }, { headers });
    
  } catch (error) {
    console.error('Send new leads error:', error);

    const message = error?.response?.data?.error?.message || error?.message || 'Unknown error';
    const isAuthError = error?.code === 401 || /invalid_grant|Invalid Credentials/i.test(message);
    const isPermissionsError = error?.code === 403 || /insufficient_permissions|Missing or insufficient permissions|not authorized to send from/i.test(message);

    if (isAuthError) {
      return NextResponse.json(
        {
          error: 'Gmail access token expired or invalid',
          details: 'Please re-authenticate with Gmail',
          code: 'GMAIL_AUTH_ERROR'
        },
        { status: 401, headers }
      );
    }

    if (isPermissionsError) {
      return NextResponse.json(
        {
          error: 'Insufficient Gmail permissions',
          details: 'Please grant Gmail send permissions and ensure the Gmail account matches the sender email.',
          code: 'GMAIL_PERMISSIONS_ERROR'
        },
        { status: 403, headers }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to send emails',
        details: message,
        sent: 0,
        failed: 0,
        skipped: 0
      },
      { status: 500, headers }
    );
  }
}