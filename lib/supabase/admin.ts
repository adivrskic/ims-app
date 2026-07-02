import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. **Server-side only. Never expose.**
 *
 * Uses the SUPABASE_SERVICE_ROLE_KEY (not the anon key). Bypasses Row
 * Level Security — can read and write across every organization.
 * Intended for two purposes:
 *
 *   1. Staff admin actions (creating new organizations + their owners,
 *      reading workspace-wide stats from /admin pages).
 *   2. Background jobs (cron snapshots, scheduled emails).
 *
 * Required env vars (set in `.env.local` and in your hosting provider):
 *   NEXT_PUBLIC_SUPABASE_URL          (already set)
 *   NEXT_PUBLIC_SUPABASE_DB_SCHEMA    (already set, "app")
 *   SUPABASE_SERVICE_ROLE_KEY         (NEW — get from Supabase dashboard
 *                                      Settings → API → Service role key)
 *
 * Do not import this file from any client component. The build will
 * succeed but the service-role key would end up in the client bundle.
 * The "use server" directive on callers protects us — the bundler
 * tree-shakes server-only modules out of client builds.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set — required for admin client"
    );
  }
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local from " +
        "your Supabase project's Settings → API page (Service role key, " +
        "NOT the anon key)."
    );
  }

  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: (process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA as "public") ?? "app",
    },
  });
}
