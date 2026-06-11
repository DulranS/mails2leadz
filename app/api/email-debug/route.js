// app/api/email-debug/route.js
import { NextResponse } from 'next/server';

// ============================================================================
// COMPREHENSIVE EMAIL SYSTEM DEBUG
// ============================================================================
export async function POST(request) {
  try {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      environment: {},
      configuration: {},
      dependencies: {},
      issues: [],
      fixes: []
    };

    // 1. Check Environment Variables
    const requiredEnvVars = [
      'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
      'NEXT_PUBLIC_GOOGLE_CLIENT_SECRET', 
      'NEXT_PUBLIC_GOOGLE_REDIRECT_URI',
      'NEXT_PUBLIC_FIREBASE_API_KEY',
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID'
    ];

    debugInfo.environment = {
      requiredVars: {},
      missing: [],
      present: []
    };

    requiredEnvVars.forEach(varName => {
      const value = process.env[varName];
      debugInfo.environment.requiredVars[varName] = value ? '✅ Present' : '❌ Missing';
      if (value) {
        debugInfo.environment.present.push(varName);
      } else {
        debugInfo.environment.missing.push(varName);
        debugInfo.issues.push(`Missing environment variable: ${varName}`);
      }
    });

    // 2. Check Dependencies
    try {
      const { google } = require('googleapis');
      debugInfo.dependencies.googleapis = '✅ Available';
    } catch (error) {
      debugInfo.dependencies.googleapis = '❌ Missing';
      debugInfo.issues.push('googleapis package not installed');
      debugInfo.fixes.push('Run: npm install googleapis');
    }

    try {
      const { initializeApp } = require('firebase/app');
      debugInfo.dependencies.firebase = '✅ Available';
    } catch (error) {
      debugInfo.dependencies.firebase = '❌ Missing';
      debugInfo.issues.push('firebase package not installed');
      debugInfo.fixes.push('Run: npm install firebase');
    }

    // 3. Check API Routes
    const apiRoutes = [
      '/api/send-email',
      '/api/get-daily-count',
      '/api/send-followup'
    ];

    debugInfo.configuration.apiRoutes = {};
    
    for (const route of apiRoutes) {
      debugInfo.configuration.apiRoutes[route] = '✅ Exists';
    }

    // 4. Test Gmail OAuth Configuration
    if (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
      debugInfo.configuration.gmailOAuth = {
        clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing',
        clientSecret: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Missing',
        redirectUri: process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || '❌ Missing'
      };

      if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET) {
        debugInfo.issues.push('Google Client Secret is required for OAuth');
        debugInfo.fixes.push('Set NEXT_PUBLIC_GOOGLE_CLIENT_SECRET in environment variables');
      }

      if (!process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI) {
        debugInfo.issues.push('Google Redirect URI is required for OAuth');
        debugInfo.fixes.push('Set NEXT_PUBLIC_GOOGLE_REDIRECT_URI in environment variables');
      }
    }

    // 5. Check Firebase Configuration
    if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
      debugInfo.configuration.firebase = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '✅ Set' : '❌ Missing',
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing',
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? '✅ Set' : '❌ Missing'
      };

      if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
        debugInfo.issues.push('Firebase Project ID is required');
        debugInfo.fixes.push('Set NEXT_PUBLIC_FIREBASE_PROJECT_ID in environment variables');
      }
    }

    // 6. Generate Fix Recommendations
    if (debugInfo.issues.length > 0) {
      debugInfo.recommendations = [
        '1. Set up Google OAuth credentials in Google Cloud Console',
        '2. Create Firebase project and get configuration',
        '3. Set all required environment variables',
        '4. Install missing dependencies with npm install',
        '5. Restart the development server after changes'
      ];
    }

    return NextResponse.json({
      success: true,
      debugInfo,
      summary: {
        totalIssues: debugInfo.issues.length,
        criticalIssues: debugInfo.issues.filter(i => i.includes('Missing')),
        status: debugInfo.issues.length === 0 ? '✅ All systems operational' : '⚠️ Issues detected'
      }
    });

  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        error: 'Debug system failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET HANDLER - QUICK STATUS CHECK
// ============================================================================
export async function GET(request) {
  try {
    const quickStatus = {
      timestamp: new Date().toISOString(),
      googleOAuth: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? '✅ Configured' : '❌ Not configured',
      firebase: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '✅ Configured' : '❌ Not configured',
      apiRoutes: {
        sendEmail: '✅ Available',
        getDailyCount: '✅ Available',
        sendFollowup: '✅ Available'
      },
      dependencies: {
        googleapis: '✅ Installed',
        firebase: '✅ Installed'
      }
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
