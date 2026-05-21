/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    staleTimes: {
      // How long the Router Cache holds a page's client-side render before
      // refetching on revisit. Default for dynamic routes is 0 (always
      // refetch), which is why hitting back triggers a full re-fetch.
      //
      // 30s for dynamic = navigating back to a page you were on a few
      // seconds ago is instant. Stale enough that real changes show up
      // soon, fresh enough that the dashboard feels snappy.
      dynamic: 30,
      // Static routes (already cached server-side) get a longer hold.
      static: 300,
    },
  },
};

export default nextConfig;
