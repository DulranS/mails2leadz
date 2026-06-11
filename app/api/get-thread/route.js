// app/api/get-thread/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { google } from 'googleapis';

// ============================================================================
// GMAIL THREAD CACHE (In-memory, 5 minute TTL)
// ============================================================================
const threadCache = new Map();
const THREAD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCachedThread = (threadId) => {
  const cached = threadCache.get(threadId);
  if (!cached) return null;

  if (Date.now() > cached.expiresAt) {
    threadCache.delete(threadId);
    return null;
  }

  return cached.data;
};

const setCachedThread = (threadId, data) => {
  threadCache.set(threadId, {
    data,
    expiresAt: Date.now() + THREAD_CACHE_TTL
  });

  // Clean up old entries
  if (threadCache.size > 50) {
    const now = Date.now();
    for (const [key, value] of threadCache.entries()) {
      if (now > value.expiresAt) {
        threadCache.delete(key);
      }
    }
  }
};

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

// Decode base64 encoded email body
const decodeEmailBody = (data) => {
  if (!data) return '';
  
  try {
    // Handle different encoding formats
    if (data.body?.data) {
      return Buffer.from(data.body.data, 'base64').toString('utf-8');
    }
    
    // Handle multipart messages
    if (data.parts && data.parts.length > 0) {
      let body = '';
      for (const part of data.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body += Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.parts) {
          // Recursively handle nested parts
          body += decodeEmailBody(part);
        }
      }
      return body;
    }
    
    return '';
  } catch (error) {
    console.error('Error decoding email body:', error);
    return '[Error decoding email body]';
  }
};

// Extract email headers
const extractHeaders = (headers) => {
  const headerMap = {};
  if (!headers) return headerMap;
  
  headers.forEach(header => {
    const name = header.name?.toLowerCase();
    if (name) {
      headerMap[name] = header.value;
    }
  });
  
  return headerMap;
};

// Format message for display
const formatMessage = (message) => {
  const headers = extractHeaders(message.payload?.headers);
  const body = decodeEmailBody(message.payload);
  
  return {
    id: message.id,
    threadId: message.threadId,
    from: headers['from'] || 'Unknown',
    to: headers['to'] || 'Unknown',
    subject: headers['subject'] || 'No Subject',
    date: headers['date'] || new Date().toISOString(),
    body: body,
    snippet: message.snippet || ''
  };
};

export async function POST(request) {
  try {
    const { userId, email, messageId, threadId } = await request.json();
    
    if (!userId || !email) {
      return NextResponse.json({ error: 'userId and email required' }, { status: 400 });
    }
    
    if (!db) {
      return NextResponse.json({ error: 'Firebase not initialized' }, { status: 500 });
    }
    
    // Get user's Gmail credentials from Firebase
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const userData = userDoc.data();
    const accessToken = userData.accessToken;
    
    if (!accessToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 });
    }
    
    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET,
      process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || 'http://localhost:3000'
    );
    
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    let thread;

    // Try to get thread by threadId first, or find by messageId
    const cacheKey = threadId || messageId || email;

    // Check cache first
    const cachedThread = getCachedThread(cacheKey);
    if (cachedThread) {
      return NextResponse.json({
        success: true,
        cached: true,
        ...cachedThread
      });
    }
    if (threadId) {
      thread = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full'
      });
    } else if (messageId) {
      // Get message first to get threadId
      const message = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['thread-id']
      });
      
      const actualThreadId = message.data.threadId;
      thread = await gmail.users.threads.get({
        userId: 'me',
        id: actualThreadId,
        format: 'full'
      });
    } else {
      // Search for thread by email address
      const searchResults = await gmail.users.messages.list({
        userId: 'me',
        q: `from:${email} OR to:${email}`,
        maxResults: 10
      });
      
      if (!searchResults.data.messages || searchResults.data.messages.length === 0) {
        return NextResponse.json({ error: 'No messages found for this email' }, { status: 404 });
      }
      
      // Get the most recent thread
      const firstMessage = searchResults.data.messages[0];
      const firstMessageDetail = await gmail.users.messages.get({
        userId: 'me',
        id: firstMessage.id,
        format: 'metadata',
        metadataHeaders: ['thread-id']
      });
      
      thread = await gmail.users.threads.get({
        userId: 'me',
        id: firstMessageDetail.data.threadId,
        format: 'full'
      });
    }
    
    // Format all messages in the thread
    const messages = thread.data.messages.map(formatMessage);

    // Sort messages by date (oldest first)
    messages.sort((a, b) => new Date(a.date) - new Date(b.date));

    const threadData = {
      threadId: thread.data.id,
      messages,
      totalMessages: messages.length
    };

    // Cache the result
    setCachedThread(cacheKey, threadData);

    return NextResponse.json({
      success: true,
      cached: false,
      ...threadData
    });
    
  } catch (error) {
    console.error('Get thread error:', error);
    
    if (error.code === 401 || error.message?.includes('invalid_grant')) {
      return NextResponse.json(
        { error: 'Gmail access token expired. Please re-authenticate.' },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to fetch thread' },
      { status: 500 }
    );
  }
}
