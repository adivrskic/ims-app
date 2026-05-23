/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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