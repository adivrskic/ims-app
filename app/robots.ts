import type { MetadataRoute } from "next";

/**
 * The app host is the product, not the marketing site: every page is either
 * behind sign-in or a sign-in/sign-up form. Nothing here should be indexed
 * (the public pages live on nautilusinventory.com).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
