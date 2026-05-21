import { headers } from "next/headers";

/**
 * Server-side kiosk detection.
 *
 * Reads `?kiosk=1` from the request URL. Used by layouts and pages
 * that need to know during SSR whether to render chrome.
 *
 * Why headers() instead of useSearchParams: server components don't
 * have access to searchParams unless they're page-level. Layouts
 * sit above pages and don't receive searchParams as a prop. We read
 * the URL from the x-url header set by middleware.
 */
export async function isKioskMode(): Promise<boolean> {
  const h = await headers();
  const url = h.get("x-url");
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("kiosk") === "1";
  } catch {
    return false;
  }
}
