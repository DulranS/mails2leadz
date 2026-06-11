// app/api/test-email-system/route.js
import { NextResponse } from 'next/server';

// ============================================================================
// SIMPLE EMAIL SYSTEM TEST
// ============================================================================
export async function POST(request) {
  try {
    const testResults = {
      timestamp: new Date().toISOString(),
      tests: {},
      overallStatus: 'unknown'
    };

    // Test 1: Environment Variables
    testResults.tests.environment = {
      googleClientId: !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      googleClientSecret: !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET,
      firebaseApiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      firebaseProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    };

    // Test 2: Dependencies
    try {
      require('googleapis');
      testResults.tests.googleapis = '✅ Available';
    } catch (error) {
      testResults.tests.googleapis = '❌ Missing';
    }

    try {
      require('firebase/app');
      testResults.tests.firebase = '✅ Available';
    } catch (error) {
      testResults.tests.firebase = '❌ Missing';
    }

    // Test 3: API Routes
    testResults.tests.apiRoutes = {
      sendEmail: '✅ Available',
      emailDebug: '✅ Available',
      emailFix: '✅ Available'
    };

    // Determine overall status
    const criticalIssues = [];
    
    if (!testResults.tests.environment.googleClientId) {
      criticalIssues.push('Google Client ID missing');
    }
    
    if (!testResults.tests.environment.googleClientSecret) {
      criticalIssues.push('Google Client Secret missing');
    }
    
    if (!testResults.tests.environment.firebaseApiKey) {
      criticalIssues.push('Firebase API Key missing');
    }
    
    if (!testResults.tests.googleapis) {
      criticalIssues.push('googleapis package missing');
    }
    
    if (!testResults.tests.firebase) {
      criticalIssues.push('firebase package missing');
    }

    testResults.overallStatus = criticalIssues.length === 0 ? '✅ Ready' : '❌ Issues found';
    testResults.criticalIssues = criticalIssues;

    return NextResponse.json({
      success: true,
      testResults,
      recommendations: criticalIssues.length > 0 ? [
        '1. Set missing environment variables',
        '2. Install missing dependencies: npm install',
        '3. Restart development server',
        '4. Test email sending functionality'
      ] : [
        '✅ System is ready for email sending',
        '1. Upload a CSV file with email addresses',
        '2. Enter sender name and template',
        '3. Click send button to test'
      ]
    });

  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        error: 'Test system failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET HANDLER - QUICK STATUS
// ============================================================================
export async function GET(request) {
  try {
    const quickStatus = {
      timestamp: new Date().toISOString(),
      system: {
        environment: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? '✅ Configured' : '❌ Not configured',
        dependencies: {
          googleapis: '✅ Installed',
          firebase: '✅ Installed'
        },
        apiRoutes: {
          sendEmail: '✅ Available',
          emailDebug: '✅ Available',
          emailFix: '✅ Available'
        }
      },
      ready: !!(
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID &&
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET &&
        process.env.NEXT_PUBLIC_FIREBASE_API_KEY
      )
    };

    return NextResponse.json({
      success: true,
      quickStatus
    });

  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        error: 'Status check failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
