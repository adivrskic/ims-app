import { NextResponse, type NextRequest } from "next/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import {
  buildAuthorizeUrl,
  normalizeShopDomain,
  signState,
} from "@/lib/integrations/shopify/oauth";

/**
 * Begin OAuth. The user posts a shop domain; we redirect them to Shopify's
 * authorize URL. Shopify will redirect back to /callback with the code.
 */
export async function GET(req: NextRequest) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (!["owner", "admin"].includes(ctx.role)) {
    return NextResponse.json(
      { error: "Only admins can connect integrations" },
      { status: 403 }
    );
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!apiKey || !apiSecret || !appUrl) {
    return NextResponse.json(
      {
        error:
          "SHOPIFY_API_KEY / SHOPIFY_API_SECRET / NEXT_PUBLIC_APP_URL not configured",
      },
      { status: 500 }
    );
  }

  const shopRaw = req.nextUrl.searchParams.get("shop") ?? "";
  const shopDomain = normalizeShopDomain(shopRaw);
  if (!shopDomain) {
    return NextResponse.redirect(
      new URL("/integrations/shopify?err=invalid_shop", req.url)
    );
  }

  const state = signState(ctx.orgId, apiSecret);
  const authorizeUrl = buildAuthorizeUrl({
    shopDomain,
    apiKey,
    scopes: [
      "read_orders",
      "read_products",
      "read_inventory",
      "read_locations",
      "read_fulfillments",
    ],
    redirectUri: `${appUrl}/api/integrations/shopify/callback`,
    state,
  });

  return NextResponse.redirect(authorizeUrl);
}
