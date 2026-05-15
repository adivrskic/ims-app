import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every path except:
     * - _next (Next.js internals)
     * - favicon, font, image, icon assets
     * - public files (extensions)
     */
    "/((?!_next/static|_next/image|favicon.ico|fonts|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)).*)",
  ],
};
