// app/api/cache-clear/route.js
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../lib/server/route-helpers.js';
import { clearAllCache, invalidateCache } from '../../../lib/firebase-cache.js';

export async function POST(request) {
  const admin = requireAdmin(request); // server-wide diagnostics: the operator only, never a tenant
  if (admin.response) return admin.response;
  try {
    const { collection } = await request.json();

    if (collection) {
      // Clear specific collection
      invalidateCache(collection);
      return NextResponse.json({
        success: true,
        message: `Cache cleared for collection: ${collection}`,
        timestamp: new Date().toISOString()
      });
    } else {
      // Clear all cache
      clearAllCache();
      return NextResponse.json({
        success: true,
        message: 'All cache cleared',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Clear cache error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
