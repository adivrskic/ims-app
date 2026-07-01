/**
 * Sanitize a user-supplied post-auth redirect target (the `next` param).
 *
 * `next` flows in from the URL / a hidden form field, so it's attacker
 * controllable. Without validation, `next=https://evil.com` (or the
 * protocol-relative `//evil.com`, or the `/\evil.com` backslash trick browsers
 * normalize to `//`) sends the victim off-origin immediately after they
 * authenticate — a classic open-redirect phishing vector. Only same-origin
 * ABSOLUTE PATHS are allowed; anything else collapses to `fallback`.
 */
export function safeNext(
  next: string | null | undefined,
  fallback = "/"
): string {
  if (!next) return fallback;
  // Must be a path on our own origin: a single leading "/", and not the
  // "//" / "/\" forms that resolve to another host.
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
