// app/api/handle-sms-reply/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { parseQualificationResponse, formatQualificationSummary, shouldArchiveLead, shouldStopFollowUp } from '../../../lib/sms-qualifier';

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
    const { phone, response, userId } = requestData;

    if (!phone || !response || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Find the qualification record
    const q = query(
      collection(db, 'sms_qualifications'),
      where('userId', '==', userId),
      where('phone', '==', phone),
      where('status', '==', 'sent')
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return NextResponse.json({ error: 'No matching qualification record found' }, { status: 404 });
    }

    const qualificationDoc = querySnapshot.docs[0];
    const qualificationData = qualificationDoc.data();

    // Parse the response
    const qualification = parseQualificationResponse(response);

    // Update qualification record
    await updateDoc(doc(db, 'sms_qualifications', qualificationDoc.id), {
      response,
      qualified: qualification.qualified,
      qualifiedAt: new Date().toISOString(),
      summary: qualification.summary,
      archived: shouldArchiveLead(qualification),
      stopFollowUp: shouldStopFollowUp(qualification)
    });

    // If qualified, update the lead record in sent_emails
    if (qualification.qualified) {
      const leadQuery = query(
        collection(db, 'sent_emails'),
        where('userId', '==', userId),
        where('to', '==', qualificationData.email)
      );

      const leadSnapshot = await getDocs(leadQuery);
      if (!leadSnapshot.empty) {
        const leadDoc = leadSnapshot.docs[0];
        await updateDoc(doc(db, 'sent_emails', leadDoc.id), {
          qualified: true,
          qualificationSummary: qualification.summary,
          qualifiedAt: new Date().toISOString(),
          qualificationMethod: 'sms'
        });
      }
    }

    // If should archive, update lead record
    if (shouldArchiveLead(qualification)) {
      const leadQuery = query(
        collection(db, 'sent_emails'),
        where('userId', '==', userId),
        where('to', '==', qualificationData.email)
      );

      const leadSnapshot = await getDocs(leadQuery);
      if (!leadSnapshot.empty) {
        const leadDoc = leadSnapshot.docs[0];
        await updateDoc(doc(db, 'sent_emails', leadDoc.id), {
          archived: true,
          archivedAt: new Date().toISOString(),
          archiveReason: qualification.reason,
          stopFollowUp: shouldStopFollowUp(qualification)
        });
      }
    }

    // Format summary
    const summary = formatQualificationSummary(qualification, { email: qualificationData.email });

    return NextResponse.json({
      success: true,
      qualified: qualification.qualified,
      summary,
      shouldArchive: shouldArchiveLead(qualification),
      stopFollowUp: shouldStopFollowUp(qualification),
      qualification
    });

  } catch (error) {
    console.error('SMS reply handling error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
