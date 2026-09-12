import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-redirect";

/**
 * Sign-out route handler. Used by the user menu AND by the layout when the
 * current device's session has been revoked from another device — a route
 * handler (unlike a server-component render) may clear the session cookies.
 */
export async function GET(req: NextRequest) {
  // This is a state-changing GET, so any page on the internet could sign the
  // user out with `<img src="https://app.../auth/signout">`. Browsers stamp
  // Sec-Fetch-Dest on every request and pages cannot forge it, so refuse the
  // sub-resource loads that make that attack work. Deny-list rather than
  // allow-list on purpose: the revoked-device path reaches here via a
  // server-side redirect, which can arrive as a document navigation OR as the
  // router's own RSC fetch, and an allow-list would break that recovery.
  const dest = req.headers.get("sec-fetch-dest");
  const SUBRESOURCE = new Set([
    "image",
    "script",
    "style",
    "font",
    "audio",
    "video",
    "track",
    "embed",
    "object",
    "manifest",
  ]);
  if (dest && SUBRESOURCE.has(dest)) {
    return new Response("Not found", { status: 404 });
  }

  const revoked = req.nextUrl.searchParams.get("revoked") === "1";
  // Carry a destination through the sign-out so "wrong account" dead ends can
  // send someone back where they were headed — an invite link, typically.
  const next = safeNext(req.nextUrl.searchParams.get("next"), "");

  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (revoked) url.searchParams.set("revoked", "1");
  if (next) url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}
