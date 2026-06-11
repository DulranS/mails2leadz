// app/api/ai-send-time-optimizer/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

// ============================================================================
// ANALYZE SEND TIMES
// ============================================================================
const analyzeSendTimes = (emails) => {
  const hourCounts = {};
  const dayCounts = {};
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
  
  const replyRates = {};
  
  emails.forEach(email => {
    const sentAt = safeToDate(email.sentAt);
    const hour = sentAt.getHours();
    const day = sentAt.getDay();
    
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    dayCounts[day] = (dayCounts[day] || 0) + 1;
    
    if (email.replied) {
      const key = `${day}-${hour}`;
      replyRates[key] = (replyRates[key] || { total: 0, replied: 0 });
      replyRates[key].total++;
      replyRates[key].replied++;
    }
  });
  
  // Find best time
  let bestHour = 10;
  let bestDay = 2;
  let bestRate = 0;
  
  Object.entries(replyRates).forEach(([key, data]) => {
    const [day, hour] = key.split('-').map(Number);
    const rate = data.replied / data.total;
    if (rate > bestRate) {
      bestRate = rate;
      bestHour = hour;
      bestDay = day;
    }
  });
  
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const nextBestTime = getNextOccurrence(bestDay, bestHour);
  
  return {
    bestHour,
    bestDay,
    bestDayName: dayNames[bestDay],
    bestRate: Math.round(bestRate * 100),
    nextOptimalTime: nextBestTime,
    nextOptimalTimeFormatted: nextBestTime.toLocaleString(),
    potentialImprovement: Math.round((bestRate - 0.15) * 100),
    insights: [
      `Best day to send: ${dayNames[bestDay]}`,
      `Best hour to send: ${bestHour}:00`,
      `Your average reply rate: ${Math.round(bestRate * 100)}%`,
      `Industry average: 15%`,
      `Potential improvement: +${Math.round((bestRate - 0.15) * 100)}%`
    ]
  };
};

// ============================================================================
// GET NEXT OCCURRENCE
// ============================================================================
const getNextOccurrence = (dayOfWeek, hour) => {
  const now = new Date();
  const result = new Date(now);
  
  const currentDay = now.getDay();
  const daysUntil = (dayOfWeek - currentDay + 7) % 7;
  
  result.setDate(result.getDate() + (daysUntil === 0 && now.getHours() >= hour ? 7 : daysUntil));
  result.setHours(hour, 0, 0, 0);
  
  if (result <= now) {
    result.setDate(result.getDate() + 7);
  }
  
  return result;
};

// ============================================================================
// POST HANDLER
// ============================================================================
export async function POST(request) {
  try {
    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }
    
    // Get user's sent emails
    const q = query(
      collection(db, 'sent_emails'),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    
    const emails = [];
    snapshot.forEach(doc => {
      emails.push(doc.data());
    });
    
    if (emails.length === 0) {
      // Default recommendations for new users
      const defaultTime = getNextOccurrence(2, 10); // Tuesday 10 AM
      return NextResponse.json({
        bestHour: 10,
        bestDay: 2,
        bestDayName: 'Tuesday',
        bestRate: 0,
        nextOptimalTime: defaultTime,
        nextOptimalTimeFormatted: defaultTime.toLocaleString(),
        potentialImprovement: 35,
        insights: [
          'Best day to send: Tuesday',
          'Best hour to send: 10:00 AM',
          'Industry average reply rate: 15%',
          'Send between 9-11 AM for best results',
          'Avoid weekends and Mondays'
        ]
      });
    }
    
    const analysis = analyzeSendTimes(emails);
    
    return NextResponse.json(analysis);
    
  } catch (error) {
    console.error('Send time optimization error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to optimize send time',
        details: error.message,
        nextOptimalTimeFormatted: new Date().toLocaleString(),
        potentialImprovement: 35,
        insights: ['Using default recommendations']
      },
      { status: 200 }
    );
  }
}