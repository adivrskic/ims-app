import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fixed-window rate limiting backed by app.rate_limit_hit (see the
 * 20260703130000_app_rate_limits migration). Buckets are plain strings —
 * conventionally "surface:identity", e.g. "api:<key-id>" or
 * "auth:signin:ip:<ip>".
 *
 * FAIL-OPEN: if the counter RPC errors, the request is allowed. Rate limiting
 * is an abuse dampener, not an auth boundary — the DB being briefly unhappy
 * must never take down sign-in or the public API.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets. 0 when allowed. */
  retryAfter: number;
}

export async function rateLimit(
  bucket: string,
  max: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("rate_limit_hit", {
      p_bucket: bucket,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error || !data) {
      if (error) console.error("rateLimit:", error.message);
      return { allowed: true, retryAfter: 0 };
    }
    const d = data as { allowed?: boolean; retry_after?: number };
    return d.allowed === false
      ? { allowed: false, retryAfter: Number(d.retry_after ?? 60) }
      : { allowed: true, retryAfter: 0 };
  } catch (err) {
    console.error("rateLimit:", err);
    return { allowed: true, retryAfter: 0 };
  }
}

/**
 * Best-effort client IP from proxy headers, for per-IP buckets on
 * unauthenticated surfaces. Netlify sets x-nf-client-connection-ip; the
 * x-forwarded-for first hop is the standard fallback. "unknown" lumps
 * header-less traffic (local dev) into one shared bucket.
 */
export function clientIpFrom(get: (name: string) => string | null): string {
  const netlify = get("x-nf-client-connection-ip")?.trim();
  if (netlify) return netlify;
  const xff = get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}
