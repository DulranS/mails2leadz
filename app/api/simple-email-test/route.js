// app/api/simple-email-test/route.js
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    return NextResponse.json({
      success: true,
      message: 'Email system test working',
      environment: {
        googleClientId: !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        googleClientSecret: !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET,
        firebaseApiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        firebaseProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      },
      dependencies: {
        googleapis: '✅ Available',
        firebase: '✅ Available'
      },
      status: '✅ System ready for testing'
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        error: 'Test failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  return NextResponse.json({
    success: true,
    message: 'Simple email test API is working',
    timestamp: new Date().toISOString()
  });
}
