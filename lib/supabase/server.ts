// SERVER-ONLY MODULE. Uses next/headers and the Supabase service role key —
// never import this from a client component or any browser-bundled code.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Supabase is not configured: missing environment variable ${name}.`,
    );
  }
  return value;
}

/**
 * Server-side Supabase client bound to the current request's cookies
 * (App Router Route Handlers / Server Components / Server Actions).
 * Throws a descriptive Error if Supabase env vars are missing.
 */
export function createServerSupabase(): SupabaseClient {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const cookieStore = cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // `setAll` was called from a Server Component where cookies are
          // read-only. Safe to ignore when session refresh is handled by
          // middleware instead.
        }
      },
    },
  });
}

/**
 * Service-role Supabase client for privileged server-side operations
 * (route handlers only — never expose to the browser). Throws a
 * descriptive Error if Supabase env vars are missing.
 */
export function createAdminSupabase(): SupabaseClient {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Returns the current authenticated user, or null when unauthenticated or
 * when Supabase is not configured (never throws).
 */
export async function getSessionUser(): Promise<User | null> {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
}
