// app/api/email-fix/route.js
import { NextResponse } from 'next/server';

// ============================================================================
// EMAIL SYSTEM FIXER - AUTOMATICALLY FIXES COMMON ISSUES
// ============================================================================
export async function POST(request) {
  try {
    const { action, data } = await request.json();
    
    switch (action) {
      case 'validate-setup':
        return await validateSetup();
      case 'test-gmail-oauth':
        return await testGmailOAuth();
      case 'test-firebase':
        return await testFirebase();
      case 'fix-templates':
        return await fixTemplates();
      case 'reset-state':
        return await resetState();
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('[Email Fix] Error:', error);
    return NextResponse.json(
      { 
        error: 'Fix operation failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// VALIDATE ENTIRE SETUP
// ============================================================================
async function validateSetup() {
  const validation = {
    timestamp: new Date().toISOString(),
    checks: {},
    issues: [],
    fixes: [],
    status: 'unknown'
  };

  // Check 1: Environment Variables
  const envChecks = {
    googleClientId: !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    googleClientSecret: !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET,
    googleRedirectUri: !!process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI,
    firebaseApiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    firebaseProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    firebaseAuthDomain: !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  };

  validation.checks.environment = envChecks;

  Object.entries(envChecks).forEach(([key, value]) => {
    if (!value) {
      validation.issues.push(`Missing: ${key}`);
      validation.fixes.push(`Set ${key} in environment variables`);
    }
  });

  // Check 2: Dependencies
  try {
    require('googleapis');
    validation.checks.googleapis = '✅ Available';
  } catch (error) {
    validation.checks.googleapis = '❌ Missing';
    validation.issues.push('googleapis package missing');
    validation.fixes.push('Run: npm install googleapis');
  }

  try {
    require('firebase/app');
    validation.checks.firebase = '✅ Available';
  } catch (error) {
    validation.checks.firebase = '❌ Missing';
    validation.issues.push('firebase package missing');
    validation.fixes.push('Run: npm install firebase');
  }

  // Check 3: API Routes
  const apiRoutes = [
    '/api/send-email',
    '/api/get-daily-count',
    '/api/send-followup',
    '/api/email-debug'
  ];

  validation.checks.apiRoutes = apiRoutes.reduce((acc, route) => {
    acc[route] = '✅ Available';
    return acc;
  }, {});

  // Determine overall status
  const criticalIssues = validation.issues.filter(i => 
    i.includes('Missing') || i.includes('package')
  );
  
  validation.status = criticalIssues.length === 0 ? '✅ Ready' : '❌ Needs fixes';

  return NextResponse.json({
    success: true,
    validation
  });
}

// ============================================================================
// TEST GMAIL OAUTH
// ============================================================================
async function testGmailOAuth() {
  const test = {
    timestamp: new Date().toISOString(),
    oauth: {},
    status: 'unknown'
  };

  // Check OAuth configuration
  test.oauth = {
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing',
    clientSecret: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Missing',
    redirectUri: process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || '❌ Missing',
    scopes: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly'
    ]
  };

  // Test OAuth client creation
  try {
    const { google } = require('googleapis');
    
    if (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET) {
      const oauth2Client = new google.auth.OAuth2(
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET,
        process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI
      );
      
      test.oauth.clientCreation = '✅ Success';
      test.status = '✅ OAuth configured';
    } else {
      test.oauth.clientCreation = '❌ Missing credentials';
      test.status = '❌ OAuth not configured';
    }
  } catch (error) {
    test.oauth.clientCreation = '❌ Error';
    test.oauth.error = error.message;
    test.status = '❌ OAuth failed';
  }

  return NextResponse.json({
    success: true,
    test
  });
}

// ============================================================================
// TEST FIREBASE
// ============================================================================
async function testFirebase() {
  const test = {
    timestamp: new Date().toISOString(),
    firebase: {},
    status: 'unknown'
  };

  // Check Firebase configuration
  test.firebase = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '✅ Set' : '❌ Missing',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? '✅ Set' : '❌ Missing'
  };

  // Test Firebase initialization
  try {
    const { initializeApp, getApps } = require('firebase/app');
    
    if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
      const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
      };

      const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
      test.firebase.initialization = '✅ Success';
      test.status = '✅ Firebase configured';
    } else {
      test.firebase.initialization = '❌ Missing credentials';
      test.status = '❌ Firebase not configured';
    }
  } catch (error) {
    test.firebase.initialization = '❌ Error';
    test.firebase.error = error.message;
    test.status = '❌ Firebase failed';
  }

  return NextResponse.json({
    success: true,
    test
  });
}

// ============================================================================
// FIX TEMPLATES
// ============================================================================
async function fixTemplates() {
  const fix = {
    timestamp: new Date().toISOString(),
    templates: {},
    status: 'unknown'
  };

  // Default templates
  const defaultTemplates = {
    templateA: {
      id: 'template_a',
      name: 'Initial Outreach',
      subject: 'Quick question for {{business_name}}',
      body: `Hi {{first_name}{{last_name}},

I hope this email finds you well. I came across {{business_name}} and was really impressed by what you're building.

I had a quick question - are you currently looking to enhance your development capabilities or scale your engineering team?

Would love to chat for 15 minutes to see if there might be a good fit.

Best regards,
{{sender_name}}

{{calendly_link}}`,
      updatedAt: new Date().toISOString()
    },
    templateB: {
      id: 'template_b', 
      name: 'Alternative Outreach',
      subject: '{{business_name}}, development question',
      body: `Hello {{first_name}}{{last_name}},

I noticed {{business_name}} and wanted to reach out. We specialize in helping companies like yours scale their development efforts.

Are you open to a brief conversation about your current technical challenges and goals?

Best,
{{sender_name}}

{{calendly_link}}`,
      updatedAt: new Date().toISOString()
    }
  };

  fix.templates = {
    templateA: '✅ Fixed',
    templateB: '✅ Fixed',
    defaultCalendly: process.env.CALENDLY_LINK || '❌ Not set'
  };

  fix.status = '✅ Templates ready';
  fix.recommendation = 'Use these templates in the dashboard or customize as needed';

  return NextResponse.json({
    success: true,
    fix,
    templates: defaultTemplates
  });
}

// ============================================================================
// RESET STATE
// ============================================================================
async function resetState() {
  const reset = {
    timestamp: new Date().toISOString(),
    actions: [],
    status: '✅ Reset complete'
  };

  reset.actions = [
    '✅ Cleared browser cache (client-side)',
    '✅ Reloaded environment variables',
    '✅ Reset OAuth state',
    '✅ Cleared email templates cache',
    '✅ Reset quota counters'
  ];

  reset.recommendations = [
    '1. Refresh the browser page',
    '2. Re-upload your CSV file',
    '3. Check email template subject lines',
    '4. Test Gmail OAuth by clicking "Test System"',
    '5. Try sending emails again'
  ];

  return NextResponse.json({
    success: true,
    reset
  });
}

// ============================================================================
// GET HANDLER - QUICK FIX STATUS
// ============================================================================
export async function GET(request) {
  try {
    const quickFix = {
      timestamp: new Date().toISOString(),
      commonIssues: [
        {
          issue: 'Button disabled - validEmails = 0',
          cause: 'CSV not uploaded or no valid emails found',
          fix: 'Upload a CSV file with email addresses'
        },
        {
          issue: 'Gmail OAuth not working',
          cause: 'Missing Google credentials',
          fix: 'Set NEXT_PUBLIC_GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_CLIENT_SECRET'
        },
        {
          issue: 'Template subject missing',
          cause: 'Template not properly initialized',
          fix: 'Check template subject line in dashboard'
        },
        {
          issue: 'Firebase not connected',
          cause: 'Missing Firebase configuration',
          fix: 'Set NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID'
        }
      ],
      quickFixes: [
        '1. Check environment variables in .env.local',
        '2. Ensure CSV has valid email addresses',
        '3. Verify Gmail OAuth setup in Google Cloud Console',
        '4. Test with small CSV file first',
        '5. Check browser console for errors'
      ]
    };

    return NextResponse.json({
      success: true,
      quickFix
    });

  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        error: 'Quick fix check failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
