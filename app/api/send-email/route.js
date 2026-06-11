// app/api/send-email/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { google } from 'googleapis';
import { cachedQuery, invalidateCache } from '../../../lib/firebase-cache.js';

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

// Helper function to replace template variables
const replaceTemplateVariables = (text, firstName, lastName, businessName) => {
  if (!text) return '';
  
  // Define all common variable name variations
  const replacements = {
    '{{first_name}}': firstName,
    '{{firstName}}': firstName,
    '{{First Name}}': firstName,
    '{{first name}}': firstName,
    '{{last_name}}': lastName,
    '{{lastName}}': lastName,
    '{{Last Name}}': lastName,
    '{{last name}}': lastName,
    '{{company}}': businessName,
    '{{Company}}': businessName,
    '{{business_name}}': businessName,
    '{{businessName}}': businessName,
    '{{Business Name}}': businessName,
    '{{business name}}': businessName,
    '{{business}}': businessName,
    '{{Business}}': businessName
  };
  
  // Apply exact replacements first
  let result = text;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'gi'), value || '');
  }
  
  // Handle any remaining {{variable}} patterns with fuzzy matching
  result = result.replace(/\{\{([^}]+)\}\}/gi, (match, variable) => {
    const varName = variable.toLowerCase().replace(/[_\s]/g, '');
    if (varName.includes('firstname')) return firstName || '';
    if (varName.includes('lastname')) return lastName || '';
    if (varName.includes('company') || varName.includes('business')) return businessName || '';
    return match; // Keep original if not recognized
  });
  
  return result;
};

const createMimeMessage = (to, subject, body, senderEmail, senderName, replyTo = null, attachments = []) => {
  const boundary = 'boundary_' + Math.random().toString(36).substring(7);
  
  let message = `From: ${senderName ? `${senderName} <${senderEmail}>` : senderEmail}\r\n`;
  message += `To: ${to}\r\n`;
  if (replyTo) message += `Reply-To: ${replyTo}\r\n`;
  message += `Subject: ${subject}\r\n`;
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
      const content = attachment.content || attachment.data;
      
      message += `--${boundary}\r\n`;
      message += `Content-Type: application/octet-stream\r\n`;
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
      contact,
      followUpCount
    } = requestData;

    // Handle follow-up requests
    if (contact && followUpCount !== undefined) {
      return await handleFollowUpSend(contact, followUpCount, userId, accessToken, requestData);
    }

    // CSV-based email sending
    if (!userId || !accessToken || !csvContent) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check daily quota
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const emailQuery = query(
      collection(db, 'sent_emails'),
      where('userId', '==', userId),
      where('sentAt', '>=', startOfDay)
    );
    
    let emailSnapshot;
    try {
      emailSnapshot = await getDocs(emailQuery);
    } catch (firebaseError) {
      emailSnapshot = { size: 0 };
    }
    
    if (emailSnapshot.size >= CONFIG.MAX_DAILY_EMAILS) {
      return NextResponse.json(
        { error: 'Daily email limit reached', dailyCount: emailSnapshot.size, limit: CONFIG.MAX_DAILY_EMAILS },
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
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground'
    );
    oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const senderEmail = process.env.GMAIL_SENDER_EMAIL || oauth2Client.credentials.email;
    const senderName = fieldMappings?.sender_name || fieldMappings?.senderName || '';
    const replyToEmail = fieldMappings?.reply_to || fieldMappings?.replyTo || null;
    
    let successCount = 0, failCount = 0, skipCount = 0;
    const results = [];
    
    for (const row of dataRows) {
      const values = parseCsvRow(row);
      const email = values[emailIndex]?.trim();
      
      if (!isValidEmail(email)) {
        failCount++;
        results.push({ email, status: 'failed', reason: 'Invalid email' });
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
      subject = replaceTemplateVariables(subject, firstName, lastName, businessName);
      body = replaceTemplateVariables(body, firstName, lastName, businessName);
      
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
async function handleFollowUpSend(contact, followUpCount, userId, accessToken, requestData) {
  if (!userId || !accessToken) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { senderName, templateToSend } = requestData;
  const email = contact.email || contact.to;
  
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const senderEmail = process.env.GMAIL_SENDER_EMAIL || oauth2Client.credentials.email;
  
  const businessName = contact.businessName || '';
  const firstName = contact.firstName || '';
  
  // Use template from request or default follow-up template
  let template = requestData.templateToSend === 'followup' ? requestData.template : null;
  
  let subject, body;
  
  if (template && template.subject && template.body) {
    // Use custom template with variable substitution
    subject = template.subject || `Following up - ${businessName}`;
    body = template.body || `Hi ${firstName},\n\nI wanted to follow up on my previous email. Are you still interested in discussing how we can help ${businessName}?\n\nBest regards,\n${senderName}`;
    
    // Apply template variable substitution
    subject = replaceTemplateVariables(subject, firstName, '', businessName);
    body = replaceTemplateVariables(body, firstName, '', businessName);
  } else {
    // Default follow-up template
    subject = `Following up - ${businessName}`;
    body = `Hi ${firstName},\n\nI wanted to follow up on my previous email. Are you still interested in discussing how we can help ${businessName}?\n\nBest regards,\n${senderName}`;
  }
  
  // Check if follow-up was already sent recently (within 1 hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentFollowUpQuery = query(
    collection(db, 'sent_emails'),
    where('userId', '==', userId),
    where('to', '==', email.toLowerCase()),
    where('lastFollowUpSentAt', '>=', oneHourAgo.toISOString())
  );
  
  let recentFollowUp = false;
  try {
    const recentSnapshot = await getDocs(recentFollowUpQuery);
    recentFollowUp = !recentSnapshot.empty;
  } catch (error) {}
  
  if (recentFollowUp) {
    return NextResponse.json({
      success: false,
      error: 'Follow-up already sent within the last hour',
      email
    }, { status: 429 });
  }
  
  try {
    const rawMessage = createMimeMessage(email, subject, body, senderEmail, senderName);
    const encoded = Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded }
    });
    
    const now = new Date().toISOString();
    
    // Update existing record AFTER successful send
    const q = query(
      collection(db, 'sent_emails'),
      where('userId', '==', userId),
      where('to', '==', email.toLowerCase())
    );
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const existingDoc = querySnapshot.docs[0];
      const docRef = doc(db, 'sent_emails', existingDoc.id);
      const existingData = existingDoc.data();
      
      const currentFollowUpCount = Number(existingData.followUpCount ?? existingData.followUpSentCount ?? 0);
      const newFollowUpCount = currentFollowUpCount + 1;
      
      // Calculate next follow-up date based on template delays (2, 5, 10 days)
      const daysToAdd = newFollowUpCount === 1 ? 2 : newFollowUpCount === 2 ? 5 : 10;
      const nextFollowUpDate = new Date();
      nextFollowUpDate.setDate(nextFollowUpDate.getDate() + daysToAdd);

      await updateDoc(docRef, {
        ...existingData,
        subject,
        body,
        template: templateToSend || 'followup',
        followUpCount: newFollowUpCount,
        followUpSentCount: newFollowUpCount,
        lastFollowUpAt: now,
        lastFollowUpSentAt: now,
        followUpDates: [...(existingData.followUpDates || []), now],
        followUpAt: newFollowUpCount < 3 ? nextFollowUpDate.toISOString() : null,
        messageId: response.data.id,
        threadId: response.data.threadId
      });

      // Invalidate cache to ensure fresh data
      invalidateCache('sent_emails');

      return NextResponse.json({
        success: true,
        followUpCount: newFollowUpCount,
        email,
        messageId: response.data.id
      });
    } else {
      // No existing record found - this should not happen for follow-ups
      return NextResponse.json({
        success: false,
        error: 'No original email record found. Cannot send follow-up without initial email.',
        code: 'NO_ORIGINAL_EMAIL'
      }, { status: 404 });
    }
    
  } catch (sendError) {
    console.error(`Follow-up send error for ${email}:`, sendError);
    return NextResponse.json({ error: sendError.message }, { status: 500 });
  }
}
