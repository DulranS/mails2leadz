// app/api/auth/callback/route.js
import { NextResponse } from 'next/server';

// Simple auth callback for Firebase Google Auth
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url));
  }

  // For Firebase client-side auth, just redirect to dashboard
  // Firebase handles the token exchange automatically
  return NextResponse.redirect(new URL('/dashboard', request.url));
}