const isDev = process.env.NODE_ENV !== "production";

/*
 * Content-Security-Policy.
 *
 * script-src keeps 'unsafe-inline' BY DESIGN — the theme-init script in
 * app/layout.tsx runs before hydration to avoid a palette flash, and Next's
 * bootstrap emits inline scripts too. Do NOT add a nonce or hash alongside it:
 * per CSP3, a nonce/hash makes browsers IGNORE 'unsafe-inline', which would
 * break every inline script that isn't covered. Either go full-nonce (needs a
 * middleware nonce threaded through the layout) or stay here — not halfway.
 *
 * style-src likewise needs 'unsafe-inline': ~900 inline `style={{...}}` props
 * across the component tree plus Tailwind's injected styles.
 *
 * connect-src must reach Supabase over both https (PostgREST/Auth) and wss
 * (Realtime — the *Realtime components that keep dashboards live).
 *
 * frame-src 'none': nothing in the app embeds a third-party frame (frame-
 * ancestors above is the other direction — who may embed US).
 * worker-src 'self' blob:: Next's dev overlay and any future OffscreenCanvas /
 * Web Worker are spawned from same-origin or blob: URLs.
 * manifest-src 'self': the PWA manifest is served from this origin.
 * upgrade-insecure-requests: production only — it would break plain-http
 * localhost in dev.
 */
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseWs = supabaseOrigin.replace(/^https:/, "wss:");

const csp = [
  `default-src 'self'`,
  // 'unsafe-eval' only in dev — React Refresh needs it; production does not.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  // cdn.simpleicons.org serves the integration provider logos (ProviderLogo).
  `img-src 'self' data: blob: https://cdn.simpleicons.org`,
  `font-src 'self' data:`,
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`.trim(),
  `frame-src 'none'`,
  `frame-ancestors 'self'`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  isDev ? "" : "upgrade-insecure-requests",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Defense in depth for frame-ancestors (older browsers).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // No page in this app uses camera/mic/geolocation. The barcode scanner is
  // keyboard-wedge (lib/useScanner.ts), not getUserMedia — so deny all three.
  // Payment Request is likewise unused (Stripe runs on its own hosted
  // checkout page, not in-app), so deny it too. WebUSB must stay allowed:
  // the Zebra label printer pairs over navigator.usb (lib/print/zebra.ts).
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()",
  },
  // HSTS is a one-way door on a custom domain — only send it in production.
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    staleTimes: {
      // How long the Router Cache holds a page's client-side render before
      // refetching on revisit. Default for dynamic routes is 0 (always
      // refetch), which is why hitting back triggered a full re-fetch.
      //
      // 120s for dynamic = navigating between pages you visited in the last
      // couple of minutes is instant, with no loading skeleton. Pages that
      // need to stay live mount a *Realtime component, which invalidates the
      // relevant cache tags + refreshes on the exact rows that changed — so
      // a longer hold here doesn't cost freshness where it matters, it just
      // removes the redundant skeleton on routine back-and-forth navigation.
      dynamic: 120,
      // Static routes (already cached server-side) get a longer hold.
      static: 300,
    },
  },
};

export default nextConfig;