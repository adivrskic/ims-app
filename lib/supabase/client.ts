"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components.
 *
 * Scoped to the `app` schema so all `.from('products')` calls hit
 * `app.products`, not `public.products`. This requires `app` to be in
 * Settings → API → Exposed schemas in the Supabase dashboard.
 *
 * The Database generic is intentionally omitted — we use the hand-written
 * types in `@/types/db` for explicit annotations on query results rather than
 * relying on supabase-js's brittle generic inference through joined selects.
 * Regenerate types with `npm run types:gen` once `app` is exposed and switch
 * to typed clients via `createBrowserClient<Database, "app">(...)`.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA as "public" },
    }
  );
}
