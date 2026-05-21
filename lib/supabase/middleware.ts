import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh + auth gate for every request.
 *
 * Every navigation runs this:
 * 1. Builds a Supabase client tied to request/response cookies.
 * 2. Calls `auth.getUser()` to force a token refresh if needed.
 * 3. Redirects unauthenticated traffic to /login for protected routes.
 *
 * Do NOT pull `supabase.auth.getUser()` apart from `NextResponse.next()`
 * — the cookies set during the auth refresh must travel back on the same
 * response, or the session silently expires.
 */
export async function updateSession(request: NextRequest) {
  // Forward the full URL to server components via a request header,
  // so lib/kiosk.ts can read ?kiosk=1 from a layout.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-url", request.url);

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA as "public" },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: import("@supabase/ssr").CookieOptions;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPath =
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/forgot") ||
    path.startsWith("/magic-link") ||
    path.startsWith("/auth/");

  if (!user && !isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPath && path !== "/auth/callback") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
