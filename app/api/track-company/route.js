// app/api/track-company/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, addDoc, updateDoc, doc, setDoc } from 'firebase/firestore';

// ============================================================================
// FIREBASE CONFIGURATION
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
} catch (configError) {
  console.error('Firebase configuration error:', configError);
  // db will be undefined, and we'll handle this in the API route
}

// ============================================================================
// POST HANDLER - Track or update company contact
// ============================================================================
export async function POST(request) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };

  try {
    // Check Firebase configuration
    if (!db) {
      console.warn('Firebase not configured, skipping company tracking');
      return NextResponse.json(
        { 
          success: false, 
          message: 'Company tracking skipped - database not configured',
          code: 'FIREBASE_NOT_CONFIGURED'
        },
        { status: 200, headers } // Return 200 to not break email sending
      );
    }

    const {
      userId,
      companyName,
      domain,
      email,
      contactName,
      csvSource,
      campaignId,
      action = 'contact' // 'contact', 'followup', 'reply'
    } = await request.json();

    if (!userId || !companyName) {
      return NextResponse.json(
        { error: 'userId and companyName are required' },
        { status: 400, headers }
      );
    }

    // Normalize company name for consistent tracking
    const normalizedCompanyName = companyName.trim().toLowerCase();
    const normalizedDomain = domain ? domain.trim().toLowerCase().replace(/^https?:\/\//, '') : null;

    // Check if company already exists
    let existingCompany = null;
    let companyDocId = null;

    try {
      // Try to find by normalized company name
      const nameQuery = query(
        collection(db, 'contacted_companies'),
        where('userId', '==', userId),
        where('normalizedCompanyName', '==', normalizedCompanyName)
      );

      const nameSnapshot = await getDocs(nameQuery);
      if (!nameSnapshot.empty) {
        existingCompany = nameSnapshot.docs[0].data();
        companyDocId = nameSnapshot.docs[0].id;
      }

      // If not found by name, try by domain
      if (!existingCompany && normalizedDomain) {
        const domainQuery = query(
          collection(db, 'contacted_companies'),
          where('userId', '==', userId),
          where('domain', '==', normalizedDomain)
        );

        const domainSnapshot = await getDocs(domainQuery);
        if (!domainSnapshot.empty) {
          existingCompany = domainSnapshot.docs[0].data();
          companyDocId = domainSnapshot.docs[0].id;
        }
      }
    } catch (queryError) {
      console.error('Failed to query existing companies:', queryError);
      // Continue with creating new company record
    }

    const now = new Date();

    if (existingCompany) {
      // Update existing company record
      const updateData = {
        lastContactedAt: now.toISOString(),
        totalContacts: (existingCompany.totalContacts || 0) + 1,
        updatedAt: now.toISOString()
      };

      // Add email to contacts array if not already present
      if (email && !existingCompany.contactEmails?.includes(email.toLowerCase().trim())) {
        updateData.contactEmails = [...(existingCompany.contactEmails || []), email.toLowerCase().trim()];
      }

      // Track CSV sources
      if (csvSource && !existingCompany.csvSources?.includes(csvSource)) {
        updateData.csvSources = [...(existingCompany.csvSources || []), csvSource];
      }

      // Update contact history
      const newContact = {
        email: email?.toLowerCase().trim(),
        contactName: contactName?.trim(),
        action,
        timestamp: now.toISOString(),
        csvSource
      };

      updateData.contactHistory = [...(existingCompany.contactHistory || []), newContact];

      // Update action-specific counters
      if (action === 'contact') {
        updateData.initialContacts = (existingCompany.initialContacts || 0) + 1;
      } else if (action === 'followup') {
        updateData.followups = (existingCompany.followups || 0) + 1;
      } else if (action === 'reply') {
        updateData.replies = (existingCompany.replies || 0) + 1;
        updateData.hasReplied = true;
      }

      try {
        await updateDoc(doc(db, 'contacted_companies', companyDocId), updateData);

        return NextResponse.json({
          success: true,
          action: 'updated',
          companyId: companyDocId,
          message: `Updated existing company: ${companyName}`
        }, { headers });
      } catch (updateError) {
        console.error('Failed to update company record:', updateError);
        return NextResponse.json({
          success: false,
          message: 'Failed to update company tracking data',
          code: 'UPDATE_FAILED'
        }, { status: 500, headers });
      }

    } else {
      // Create new company record
      const companyData = {
        userId,
        companyName: companyName.trim(),
        normalizedCompanyName,
        domain: normalizedDomain,
        contactEmails: email ? [email.toLowerCase().trim()] : [],
        csvSources: csvSource ? [csvSource] : [],
        contactHistory: [{
          email: email?.toLowerCase().trim(),
          contactName: contactName?.trim(),
          action,
          timestamp: now.toISOString(),
          csvSource
        }],
        firstContactedAt: now.toISOString(),
        lastContactedAt: now.toISOString(),
        totalContacts: 1,
        initialContacts: action === 'contact' ? 1 : 0,
        followups: action === 'followup' ? 1 : 0,
        replies: action === 'reply' ? 1 : 0,
        hasReplied: action === 'reply',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };

      try {
        const docRef = await addDoc(collection(db, 'contacted_companies'), companyData);

        return NextResponse.json({
          success: true,
          action: 'created',
          companyId: docRef.id,
          message: `Created new company record: ${companyName}`
        }, { headers });
      } catch (createError) {
        console.error('Failed to create company record:', createError);
        return NextResponse.json({
          success: false,
          message: 'Failed to create company tracking data',
          code: 'CREATE_FAILED'
        }, { status: 500, headers });
      }
    }

  } catch (error) {
    console.error('Track company error:', error);
    return NextResponse.json(
      { error: 'Failed to track company', details: error.message },
      { status: 500, headers }
    );
  }
}

// ============================================================================
// GET HANDLER - List contacted companies
// ============================================================================
export async function GET(request) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required', companies: [] },
        { status: 400, headers }
      );
    }

    const q = query(
      collection(db, 'contacted_companies'),
      where('userId', '==', userId)
    );

    const snapshot = await getDocs(q);
    const companies = [];

    snapshot.forEach(docSnapshot => {
      const data = docSnapshot.data();
      companies.push({
        id: docSnapshot.id,
        ...data,
        // Calculate derived fields
        contactCount: data.contactEmails?.length || 0,
        csvCount: data.csvSources?.length || 0,
        daysSinceLastContact: data.lastContactedAt ?
          Math.floor((new Date() - new Date(data.lastContactedAt)) / (1000 * 60 * 60 * 24)) : null
      });
    });

    // Sort by last contacted (most recent first)
    companies.sort((a, b) => new Date(b.lastContactedAt) - new Date(a.lastContactedAt));

    return NextResponse.json({
      companies,
      total: companies.length
    }, { headers });

  } catch (error) {
    console.error('List companies error:', error);
    return NextResponse.json(
      { error: 'Failed to list companies', companies: [] },
      { status: 500, headers }
    );
  }
}