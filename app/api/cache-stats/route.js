// app/api/cache-stats/route.js
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../lib/server/route-helpers.js';
import { getCacheStats } from '../../../lib/firebase-cache.js';
import { sharedBackend } from '../../../lib/server/shared-cache.js';

export async function GET(request) {
  const admin = requireAdmin(request); // server-wide diagnostics: the operator only, never a tenant
  if (admin.response) return admin.response;
  try {
    const stats = getCacheStats();

    return NextResponse.json({
      success: true,
      stats,
      serverCache: sharedBackend(), // 'redis' = shared across instances; 'memory' = per-instance only
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
