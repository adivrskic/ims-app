import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign-out route handler. Used by the user menu AND by the layout when the
 * current device's session has been revoked from another device — a route
 * handler (unlike a server-component render) may clear the session cookies.
 */
export async function GET(req: NextRequest) {
  const revoked = req.nextUrl.searchParams.get("revoked") === "1";
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = revoked ? "revoked=1" : "";
  return NextResponse.redirect(url);
}
