// app/api/ai-smart-outreach/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { google } from 'googleapis';

const requiredEnv = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
  'NEXT_PUBLIC_GOOGLE_CLIENT_SECRET',
  'GMAIL_SENDER_EMAIL',
  'OPENAI_API_KEY'
];

const missing = requiredEnv.filter(k => !process.env[k]);
if (missing.length) {
  console.warn('ai-smart-outreach missing env vars:', missing.join(', '));
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
} catch (err) {
  console.error('Firebase init failed:', err.message);
}

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

const createGmailClient = (accessToken, refreshToken) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET,
    process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
};

const createMime = (from, to, subject, body) => {
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    body
  ];
  const raw = Buffer.from(messageParts.join('\r\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return raw;
};

const sendGmail = async ({ email, subject, body, accessToken, refreshToken, senderName }) => {
  const gmail = createGmailClient(accessToken, refreshToken);
  const raw = createMime(`${senderName} <${process.env.GMAIL_SENDER_EMAIL}>`, email, subject, body);
  const result = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  return result.data;
};

export async function POST(request) {
  try {
    if (!db) {
      return NextResponse.json({ error: 'Firebase not initialized' }, { status: 500 });
    }

    const {
      companyName,
      companyWebsite,
      contactEmail,
      contactName,
      userId,
      senderName,
      senderEmail,
      accessToken,
      refreshToken,
      sendNow = true
    } = await request.json();

    if (!companyName || !userId || !senderName || !senderEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Prevent duplicate outreach emails
    if (contactEmail) {
      const normalizedEmail = contactEmail.trim().toLowerCase();
      const existingEmailQuery = query(
        collection(db, 'sent_emails'),
        where('userId', '==', userId),
        where('to', '==', normalizedEmail)
      );
      const existingEmailSnapshot = await getDocs(existingEmailQuery);
      if (!existingEmailSnapshot.empty) {
        return NextResponse.json(
          { success: false, message: 'Duplicate email prevented. Email already sent to this contact.' },
          { status: 409 }
        );
      }
    }

    const aiPrompt = `You are a smart B2B research assistant. Analyze this company to:
1) identify a relevant "opening" (e.g. recent funding, growth, product launch, hiring signal) that indicates likely urgency for software development support,
2) find the likely decision maker (title and role) and provide pragmatic contact details/approach,
3) provide 4 bullet reasons why now is the right moment to reach out,
4) craft a personalized, concise outreach email subject and body to send.

Company: ${companyName}
Website: ${companyWebsite || 'unknown'}

Return a JSON object with: opening, decisionMaker, reasons, emailDraft {subject, body}.`;

    const aiResponse = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a data-driven B2B sales research system.' },
          { role: 'user', content: aiPrompt }
        ],
        temperature: 0.7,
        max_tokens: 900,
        n: 1
      })
    });

    const aiData = await aiResponse.json();

    let metrics = {
      opening: 'Potential growth opportunity, likely technology scaling needs.',
      decisionMaker: { name: 'CEO or CTO', title: 'CTO', emailPattern: 'first.last@company.com' },
      reasons: ['Revenue acceleration', 'operational optimization', 'AI automation potential', 'speed to market'],
      emailDraft: {
        subject: `Quick idea for ${companyName}`,
        body: `Hi ${contactName || 'there'},<br><br>I noticed ${companyName}${companyWebsite ? ` (${companyWebsite})` : ''} is in a strong growth phase and likely evaluating software delivery support. I help teams launch deliverables fast, reduce developer bottlenecks, and ensure reliable QA handoff.<br><br>Would you be open to a 15-minute quick call to share one low-risk improvement we can implement this quarter?<br><br>Best,<br>${senderName}`
      }
    };

    if (aiData?.choices?.[0]?.message?.content) {
      const content = aiData.choices[0].message.content;
      try {
        const extracted = JSON.parse((content.match(/\{[\s\S]*\}/) || ['{}'])[0]);
        metrics = { ...metrics, ...extracted };
      } catch (e) {
        console.warn('AI parse fallback used', e.message);
      }
    }

    const outreachDoc = {
      userId,
      companyName,
      companyWebsite,
      contactEmail: contactEmail || null,
      contactName: contactName || null,
      senderName,
      senderEmail,
      research: metrics,
      status: 'researched',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, 'ai_smart_outreach'), outreachDoc);

    let sendResult = null;
    let sentAt = null;

    if (sendNow && contactEmail && accessToken && refreshToken) {
      const emailTo = contactEmail;
      const subject = metrics.emailDraft.subject;
      const body = metrics.emailDraft.body
        .replace(/\n/g, '<br>')
        .replace(/\r/g, '<br>');

      const gmailRes = await sendGmail({
        email: emailTo,
        subject,
        body,
        accessToken,
        refreshToken,
        senderName
      });

      sendResult = gmailRes;
      sentAt = new Date().toISOString();

      // Record sent email for duplicate protection and history tracking
      if (contactEmail) {
        await addDoc(collection(db, 'sent_emails'), {
          userId,
          to: contactEmail.trim().toLowerCase(),
          businessName: companyName || 'Unknown',
          subject,
          body,
          template: 'ai-smart-outreach',
          sentAt,
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
          messageId: gmailRes.id,
          threadId: gmailRes.threadId || null
        });
      }

      await updateDoc(doc(db, 'ai_smart_outreach', docRef.id), {
        status: 'sent',
        sentAt,
        messageId: gmailRes.id,
        gmailThreadId: gmailRes.threadId || null,
        lastUpdated: new Date().toISOString()
      });
    }

    return NextResponse.json({
      success: true,
      outreachId: docRef.id,
      metrics,
      sendResult,
      sentAt
    });
  } catch (error) {
    console.error('AI Smart Outreach error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
