import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client that reads the signed-in user's session from
 * cookies — use this in Route Handlers / Server Components when you need
 * "who is logged in" (RLS-scoped queries as that user).
 * For privileged writes that must bypass RLS (imports, sends, cron jobs),
 * use lib/supabase.js's service-role client instead.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component that can't set cookies — the
            // middleware refresh below covers session renewal in that case.
          }
        },
      },
    }
  );
}

/**
 * Returns the signed-in user, or null. Use this at the top of any route
 * that must be scoped to the caller's own account.
 */
export async function requireUser() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
