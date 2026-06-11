// app/api/send-sms-qualification/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { generateQualificationSMS, parseQualificationResponse, formatQualificationSummary, shouldArchiveLead, shouldStopFollowUp } from '../../../lib/sms-qualifier';

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

// POST Handler
export async function POST(request) {
  try {
    const requestData = await request.json();
    const { leads, userId, smsProvider = 'twilio' } = requestData;

    if (!userId || !leads || !Array.isArray(leads)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const lead of leads) {
      try {
        const phone = lead.phone || lead.phoneNumber || lead.mobile;
        if (!phone) {
          failCount++;
          results.push({ 
            email: lead.email, 
            status: 'failed', 
            reason: 'No phone number' 
          });
          continue;
        }

        // Generate qualification SMS
        const smsMessage = generateQualificationSMS(lead);

        // Send SMS (using your SMS provider - Twilio, etc.)
        // This is a placeholder - integrate with your actual SMS provider
        const smsSent = await sendSMS(phone, smsMessage, smsProvider);

        if (smsSent.success) {
          // Save qualification attempt to Firebase
          const qualificationData = {
            userId,
            email: lead.email,
            phone: phone,
            smsMessage,
            sentAt: new Date().toISOString(),
            status: 'sent',
            qualified: null, // Will be updated when they reply
            response: null,
            archived: false,
            stopFollowUp: false
          };

          await addDoc(collection(db, 'sms_qualifications'), qualificationData);

          successCount++;
          results.push({ 
            email: lead.email, 
            status: 'success', 
            phone,
            messageId: smsSent.messageId 
          });
        } else {
          failCount++;
          results.push({ 
            email: lead.email, 
            status: 'failed', 
            reason: smsSent.error 
          });
        }

      } catch (error) {
        failCount++;
        results.push({ 
          email: lead.email, 
          status: 'failed', 
          reason: error.message 
        });
      }
    }

    return NextResponse.json({
      success: true,
      total: leads.length,
      successCount,
      failCount,
      results
    });

  } catch (error) {
    console.error('SMS qualification error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// SMS Provider Integration (Placeholder)
async function sendSMS(phone, message, provider) {
  // Integrate with your SMS provider here
  // Example for Twilio:
  /*
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  
  try {
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
    
    return { success: true, messageId: result.sid };
  } catch (error) {
    return { success: false, error: error.message };
  }
  */

  // Placeholder response
  console.log(`SMS sent to ${phone}: ${message}`);
  return { success: true, messageId: 'placeholder_' + Date.now() };
}
