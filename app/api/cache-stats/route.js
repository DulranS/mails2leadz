// app/api/cache-stats/route.js
import { NextResponse } from 'next/server';
import { getCacheStats } from '../../../lib/firebase-cache.js';

export async function GET(request) {
  try {
    const stats = getCacheStats();

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get cache stats error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
