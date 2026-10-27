import "server-only";

/**
 * The canonical public origin for this deployment.
 *
 * WHY THIS EXISTS: three call sites each invented their own hard-coded
 * fallback origin (admin onboarding magic links; transactional email links;
 * webhook test payloads) under hostnames this product never owned — the real
 * origin is only ever NEXT_PUBLIC_APP_URL (the deployed app host), the
 * request's own Origin, or localhost in development; see `appUrl()` below.
 * When NEXT_PUBLIC_APP_URL is unset in an environment, those fallbacks
 * silently minted invite links and password-reset links pointing at a stranger's
 * domain — a phishing gift, and impossible to notice because nothing errors.
 *
 * There is no safe invented default, so there isn't one here. Unset in
 * production is a misconfiguration, and this says so loudly rather than
 * papering over it with a plausible-looking hostname.
 *
 * DELIBERATE EXCEPTION — the Shopify OAuth routes
 * (app/api/integrations/shopify/{connect,callback}) read NEXT_PUBLIC_APP_URL
 * directly and 500 when it's missing. Do NOT migrate them to this helper: an
 * OAuth redirect_uri must byte-match the one registered with Shopify, so
 * falling back to the request origin would either break the handshake or let a
 * spoofed Host header steer the redirect. Failing closed is correct there.
 */

const FALLBACK_DEV_ORIGIN = "http://localhost:3000";

let warned = false;

/**
 * Resolve the public origin, with no trailing slash.
 *
 * @param requestOrigin Optional `Origin` header from the current request. Used
 *   ahead of the dev fallback so staging/preview deploys work without extra
 *   config, but never ahead of the explicitly configured value.
 */
export function appUrl(requestOrigin?: string | null): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  if (requestOrigin?.trim()) return requestOrigin.trim().replace(/\/+$/, "");

  if (process.env.NODE_ENV === "production" && !warned) {
    warned = true;
    console.error(
      "[appUrl] NEXT_PUBLIC_APP_URL is not set in production. Invite, " +
        "password-reset and email links will point at " +
        `${FALLBACK_DEV_ORIGIN} and will not work. Set it in your host's ` +
        "environment configuration."
    );
  }

  return FALLBACK_DEV_ORIGIN;
}
