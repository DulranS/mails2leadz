// app/api/list-sent-leads/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, orderBy, deleteDoc, doc } from 'firebase/firestore';

// ============================================================================
// FIREBASE CONFIGURATION WITH ERROR HANDLING
// ============================================================================
const getFirebaseConfig = () => {
  const requiredEnvVars = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required Firebase environment variables: ${missingVars.join(', ')}`);
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

let app;
let db;

try {
  const firebaseConfig = getFirebaseConfig();
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
  console.log('✅ Firebase client initialized successfully');
} catch (configError) {
  console.error('Firebase configuration error:', configError);
}

// ============================================================================
// CONFIGURATION
// ============================================================================
const CAMPAIGN_WINDOW_DAYS = 30;
const MAX_FOLLOW_UPS = 3;
const AUTO_CLEANUP_DAYS = 30; // Auto-delete records older than this

// ============================================================================
// POST HANDLER
// ============================================================================
export async function POST(request) {
  // Set response headers to ensure JSON response
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };
  
  try {
    // Check Firebase configuration
    if (!db) {
      console.warn('Firebase not configured, returning empty leads list');
      return NextResponse.json(
        {
          success: false,
          message: 'Lead listing skipped - database not configured',
          code: 'FIREBASE_NOT_CONFIGURED',
          leads: []
        },
        { status: 200, headers }
      );
    }

    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required', leads: [] },
        { status: 400, headers }
      );
    }
    
    console.log(`📧 Querying sent_emails for userId: ${userId}`);

    // Get all sent emails for user
    const q = query(
      collection(db, 'sent_emails'),
      where('userId', '==', userId)
    );

    const snapshot = await getDocs(q);
    const leads = [];
    let deletedCount = 0;

    console.log(`📧 Found ${snapshot.docs.length} documents in sent_emails`);
    
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

    const getFollowUpCount = (data) => {
      return data.followUpCount ?? data.followUpSentCount ?? 0;
    };

    const getEmailAddress = (data) => {
      const rawEmail =
        data.to ||
        data.email ||
        data.contactEmail ||
        data.recipientEmail ||
        data.recipient?.email ||
        data.toEmail ||
        '';
      return String(rawEmail).trim().toLowerCase();
    };

    const getLastFollowUpAt = (data) => {
      return data.lastFollowUpAt ?? data.lastFollowUpSentAt ?? null;
    };
    
    const now = new Date();
    
    snapshot.forEach(docSnapshot => {
      const data = docSnapshot.data();
      try {
        const email = getEmailAddress(data);
        if (!email) {
          console.warn(`Skipping sent email record ${docSnapshot.id} because recipient email is missing`);
          return;
        }

        const sentAt = safeToDate(data.sentAt);
        const daysSinceSent = (now - sentAt) / (1000 * 60 * 60 * 24);
        
        // Check if loop should be closed (30 days or 3 follow-ups)
        const shouldCloseLoop = daysSinceSent > CAMPAIGN_WINDOW_DAYS || 
                               (data.followUpCount || 0) >= MAX_FOLLOW_UPS ||
                               data.replied === true;
        
        leads.push({
          id: docSnapshot.id,
          email,
          businessName: data.businessName || '',
          sentAt: sentAt.toISOString(),
          replied: data.replied || false,
          opened: data.opened || false,
          openedCount: data.openedCount || 0,
          clicked: data.clicked || false,
          clickCount: data.clickCount || 0,
          followUpCount: getFollowUpCount(data),
          followUpAt: data.followUpAt ? 
            safeToDate(data.followUpAt).toISOString() : 
            null,
          lastFollowUpAt: getLastFollowUpAt(data) ?
            safeToDate(getLastFollowUpAt(data)).toISOString() :
            null,
          followUpDates: data.followUpDates || [],
          seemsInterested: (data.openedCount || 0) > 0 || (data.clickCount || 0) > 0,
          interestScore: calculateInterestScore(data),
          loopClosed: shouldCloseLoop,
          template: data.template || 'A',
          subject: data.subject || '',
          stage: data.stage || 'new'
        });
      } catch (docError) {
        console.error('Error processing document:', docSnapshot.id, docError);
        // Skip problematic documents but continue processing others
        return;
      }
    });
    
    // ============================================================================
    // AUTOMATIC CLEANUP OF OLD RECORDS
    // ============================================================================
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - AUTO_CLEANUP_DAYS);
    
    const oldRecords = leads.filter(lead => {
      const sentAt = new Date(lead.sentAt);
      return sentAt < cutoffDate && lead.loopClosed;
    });
    
    if (oldRecords.length > 0) {
      console.log(`🧹 Found ${oldRecords.length} old records to clean up (older than ${AUTO_CLEANUP_DAYS} days)`);
      
      // Delete old records in batches to avoid overwhelming the database
      const deletePromises = oldRecords.map(async (lead) => {
        try {
          await deleteDoc(doc(db, 'sent_emails', lead.id));
          console.log(`🗑️ Deleted old record: ${lead.email} (${lead.id})`);
          deletedCount++;
          return { success: true, id: lead.id };
        } catch (deleteError) {
          console.error(`❌ Failed to delete record ${lead.id}:`, deleteError);
          return { success: false, id: lead.id, error: deleteError.message };
        }
      });
      
      await Promise.allSettled(deletePromises);
      console.log(`✅ Cleanup complete: ${deletedCount} records deleted`);
    }
    
    // Remove deleted records from the returned leads
    const activeLeads = leads.filter(lead => {
      const sentAt = new Date(lead.sentAt);
      return !(sentAt < cutoffDate && lead.loopClosed);
    });
    
    // Sort by sentAt (newest first)
    activeLeads.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

    console.log(`✅ Successfully loaded ${activeLeads.length} sent leads for user ${userId} (${deletedCount} old records deleted)`);

    return NextResponse.json({
      leads: activeLeads,
      total: activeLeads.length,
      deletedCount
    }, { headers });
    
  } catch (error) {
    console.error('List sent leads error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to list sent leads',
        details: error.message,
        leads: []
      },
      { status: 200, headers }
    );
  }
}

// ============================================================================
// HELPER: CALCULATE INTEREST SCORE
// ============================================================================
function calculateInterestScore(data) {
  let score = 0;
  
  if (data.opened) score += 20;
  score += Math.min(30, (data.openedCount || 0) * 5);
  
  if (data.clicked) score += 30;
  score += Math.min(50, (data.clickCount || 0) * 10);
  
  if (data.replied) score += 100;
  
  return Math.min(100, score);
}
