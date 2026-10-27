import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use in Server Components and Route Handlers.
 *
 * Reads and writes auth cookies via `next/headers` so server-rendered
 * pages share the user's session. Scoped to the `app` schema.
 *
 * Server Components cannot set cookies; we swallow the error in that case
 * and rely on the middleware to refresh the session on subsequent requests.
 *
 * The Database generic is intentionally omitted — see lib/supabase/client.ts.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA as "public" },
      // Session cookies are Secure in production (never sent over plain http)
      // and SameSite=Lax (not attached to cross-site POSTs). Must match
      // lib/supabase/middleware.ts, which writes the same cookies on refresh.
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: import("@supabase/ssr").CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Setting cookies from a Server Component throws — that's expected.
            // Middleware will refresh the session on the next request.
          }
        },
      },
    }
  );
}
