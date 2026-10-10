// app/api/send-email/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, updateDoc, query, where, getDocs } from '../../../lib/server-firestore.js';
import { google } from 'googleapis';
import { cachedQuery, invalidateCache } from '../../../lib/firebase-cache.js';
import { headerSafe, isLostDeal } from '../../../lib/server/route-helpers.js';
import { countToday } from '../../../lib/server/daily-count.js';
import { fillTemplate, resolveSenderName } from '../../../lib/server/template-vars.js';

// The dashboard sends in small batches, so one request should finish well inside this.
export const maxDuration = 60;

// Firebase Config
const getFirebaseConfig = () => {
  const requiredEnvVars = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new Error(`Missing Firebase env vars: ${missingVars.join(', ')}`);
  }

  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
  };
};

let app, db;
try {
  const firebaseConfig = getFirebaseConfig();
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
} catch (configError) {
  console.error('Firebase config error:', configError);
}

// Config
const CONFIG = {
  MAX_DAILY_EMAILS: 500,
  RATE_LIMIT_DELAY_MS: 200
};

// Helpers
const parseCsvRow = (str) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (i + 1 < str.length && str[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map(field => field.replace(/[\r\n]/g, '').trim());
};

const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const cleaned = email.trim().toLowerCase();
  if (cleaned.length < 5) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(cleaned);
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

const createMimeMessage = (to, subject, body, senderEmail, senderName, replyTo = null, attachments = []) => {
  const boundary = 'boundary_' + Math.random().toString(36).substring(7);

  // If no sender address is configured, omit From: Gmail then uses the signed-in account (never send "From: undefined").
  // Every header value is forced onto one line so a pasted/AI-written value can never add extra headers.
  let message = senderEmail ? `From: ${senderName ? `${headerSafe(senderName)} <${headerSafe(senderEmail)}>` : headerSafe(senderEmail)}\r\n` : '';
  message += `To: ${headerSafe(to)}\r\n`;
  if (replyTo) message += `Reply-To: ${headerSafe(replyTo)}\r\n`;
  message += `Subject: ${encodeSubject(headerSafe(subject))}\r\n`;
  message += `MIME-Version: 1.0\r\n`;

  if (attachments.length > 0) {
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

    // Add text body
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
    message += `${body}\r\n`;

    // Add attachments
    attachments.forEach(attachment => {
      const filename = attachment.filename || 'attachment';
      const mimeType = attachment.mimeType || 'application/octet-stream';
      const content = attachment.base64 || attachment.content || attachment.data;

      console.log('[Send Email] Adding attachment:', {
        filename,
        mimeType,
        hasBase64: !!attachment.base64,
        hasContent: !!attachment.content,
        hasData: !!attachment.data,
        contentLength: content?.length || 0
      });

      message += `--${boundary}\r\n`;
      message += `Content-Type: ${mimeType}\r\n`;
      message += `Content-Disposition: attachment; filename="${filename}"\r\n`;
      message += `Content-Transfer-Encoding: base64\r\n\r\n`;
      message += `${content}\r\n`;
    });

    message += `--${boundary}--\r\n`;
  } else {
    // Simple text message without attachments
    message += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
    message += `${body}\r\n`;
  }

  return message;
};

// POST Handler
export async function POST(request) {
  try {
    const requestData = await request.json();
    const {
      csvContent,
      fieldMappings,
      accessToken,
      refreshToken,
      abTestMode,
      templateA,
      templateB,
      templateToSend,
      emailImages = [],
      emailAttachments = [],
      userId,
      csvSource,
      senderName: typedSenderName,
    } = requestData;

    // CSV-based email sending
    if (!userId || !accessToken || !csvContent) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Daily safety limit (protects the customer's Gmail account from being flagged for bulk sending).
    // If today's count cannot be read at all we continue, but the limit is also enforced inside the loop below.
    const sentToday = await countToday(db, 'sent_emails', 'sentAt', userId);
    let remaining = CONFIG.MAX_DAILY_EMAILS - (sentToday ?? 0);
    if (remaining <= 0) {
      return NextResponse.json(
        { error: 'Daily email limit reached', dailyCount: sentToday, limit: CONFIG.MAX_DAILY_EMAILS },
        { status: 429 }
      );
    }

    // Parse CSV
    const lines = csvContent.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV must have header + data rows' }, { status: 400 });
    }
    
    const headers = parseCsvRow(lines[0]);
    const dataRows = lines.slice(1);
    const emailColumn = fieldMappings?.email || fieldMappings?.Email || 'email';
    const emailIndex = headers.findIndex(h => h.toLowerCase() === emailColumn.toLowerCase());
    
    if (emailIndex === -1) {
      return NextResponse.json({ error: `Email column '${emailColumn}' not found` }, { status: 400 });
    }
    
    // Setup Gmail
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground'
    );
    oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const senderEmail = process.env.GMAIL_SENDER_EMAIL || oauth2Client.credentials.email;
    const senderMapping = fieldMappings?.sender_name || fieldMappings?.senderName || '';
    const replyToEmail = fieldMappings?.reply_to || fieldMappings?.replyTo || null;
    
    let successCount = 0, failCount = 0, skipCount = 0;
    const results = [];
    
    for (const row of dataRows) {
      if (remaining <= 0) {
        skipCount++;
        results.push({ email: parseCsvRow(row)[emailIndex]?.trim(), status: 'skipped', reason: `Daily limit of ${CONFIG.MAX_DAILY_EMAILS} reached: continue tomorrow` });
        continue;
      }
      const values = parseCsvRow(row);
      const email = values[emailIndex]?.trim();
      
      if (!isValidEmail(email)) {
        failCount++;
        results.push({ email, status: 'failed', reason: 'Invalid email' });
        continue;
      }
      
      // A lead the owner marked Lost ("not interested" / "asked to stop") is never emailed again from here.
      if (await isLostDeal(db, userId, email)) {
        skipCount++;
        results.push({ email, status: 'skipped', reason: 'Marked Lost: reopen the deal to contact again' });
        continue;
      }

      // Check duplicates - prevent sending to same email within 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const duplicateQuery = query(
        collection(db, 'sent_emails'),
        where('userId', '==', userId),
        where('to', '==', email.toLowerCase()),
        where('sentAt', '>=', twentyFourHoursAgo.toISOString())
      );
      
      let isDuplicate = false;
      try {
        const duplicateSnapshot = await getDocs(duplicateQuery);
        isDuplicate = !duplicateSnapshot.empty;
      } catch (error) {}
      
      if (isDuplicate) {
        skipCount++;
        results.push({ email, status: 'skipped', reason: 'Already sent (within 24 hours)' });
        continue;
      }
      
      // Build email
      const recipient = {};
      headers.forEach((header, index) => { recipient[header] = values[index] || ''; });
      
      const businessName = recipient[fieldMappings?.company || fieldMappings?.business_name || fieldMappings?.businessName || ''];
      const firstName = recipient[fieldMappings?.first_name || fieldMappings?.firstName || ''];
      const lastName = recipient[fieldMappings?.last_name || fieldMappings?.lastName || ''];
      
      let template = abTestMode && templateA && templateB ? (templateToSend === 'A' ? templateA : templateB) : templateA || templateB || '';
      
      let subject = template.subject || '';
      let body = template.body || '';
      
      // Apply template variable substitution
      const senderName = resolveSenderName({ mappedTo: senderMapping, rowValues: recipient, typedName: typedSenderName });
      const vars = { firstName, lastName, businessName, senderName };
      subject = fillTemplate(subject, vars);
      body = fillTemplate(body, vars);
      
      try {
        const rawMessage = createMimeMessage(email, subject, body, senderEmail, senderName, replyToEmail, emailAttachments);
        const encoded = Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        
        const response = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: encoded }
        });
        
        // Save to Firebase AFTER successful send
        const emailData = {
          userId,
          to: email.toLowerCase(),
          businessName,
          subject,
          body,
          template: abTestMode ? templateToSend : 'A',
          sentAt: new Date().toISOString(),
          opened: false,
          openedCount: 0,
          clicked: false,
          clickCount: 0,
          replied: false,
          followUpCount: 0,
          followUpSentCount: 0,
          followUpAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // First follow-up at 2 days (matches template)
          lastFollowUpAt: null,
          lastFollowUpSentAt: null,
          followUpDates: [],
          messageId: response.data.id,
          threadId: response.data.threadId,
          csvSource: csvSource || 'unknown'
        };
        
        await addDoc(collection(db, 'sent_emails'), emailData);

        successCount++;
        remaining--;
        results.push({ email, status: 'success', messageId: response.data.id });

        await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY_MS));
        
      } catch (sendError) {
        failCount++;
        results.push({ email, status: 'failed', reason: sendError.message });
      }
    }

    // Invalidate cache after batch send
    invalidateCache('sent_emails');

    return NextResponse.json({
      success: true,
      total: dataRows.length,
      // `sent/failed/skipped` are what the dashboard reads; the *Count names are kept for older callers.
      sent: successCount,
      failed: failCount,
      skipped: skipCount,
      successCount,
      failCount,
      skipCount,
      results
    });
    
  } catch (error) {
    console.error('Send email error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Follow-up Handler
