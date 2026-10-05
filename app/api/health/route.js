// Public uptime probe. Deliberately reveals nothing about configuration.
// (Missing-variable details are logged server-side only.)
import { validateRequiredEnv } from '../../../lib/config';

export async function GET() {
  let ok = true;
  try {
    const missing = validateRequiredEnv();
    if (missing.length) {
      ok = false;
      console.warn('[health] missing configuration:', missing.join(', '));
    }
  } catch {
    ok = false;
  }
  return new Response(JSON.stringify({ status: ok ? 'ok' : 'degraded', timestamp: new Date().toISOString() }), {
    status: ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
