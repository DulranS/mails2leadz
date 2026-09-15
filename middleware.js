import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Standard Supabase + Next.js App Router session-refresh middleware.
// Without this, sessions silently expire mid-use instead of auto-refreshing.
export async function middleware(request) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase isn't configured (missing/placeholder env vars), don't take
  // the whole site down — just skip session refresh for this request. Every
  // page still gets its own auth check client-side / server-side as needed.
  if (!url || !anonKey) {
    console.error('middleware: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return response;
  }

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    await supabase.auth.getUser();
  } catch (err) {
    // Auth refresh is best-effort. A network blip or misconfigured Supabase
    // project should degrade gracefully, not 500 every page on the site.
    console.error('middleware: Supabase auth refresh failed', err);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
};
