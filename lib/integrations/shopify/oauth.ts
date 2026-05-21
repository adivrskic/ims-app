import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Shopify OAuth — Authorization Code grant flow.
 *
 * Flow:
 *  1. User pastes their shop domain ("my-shop.myshopify.com")
 *  2. We redirect them to https://{shop}/admin/oauth/authorize with our
 *     client_id, scopes, redirect_uri, and a state param we generate
 *  3. They approve → Shopify redirects to our callback with `code` + same `state`
 *  4. We verify state matches AND verify the HMAC Shopify includes in
 *     callback query params
 *  5. We POST the code to /admin/oauth/access_token to get the permanent token
 *  6. Encrypt + store the token, then redirect user to the config page
 *
 * State is a signed value containing the org_id + a nonce. Signing prevents
 * an attacker from constructing a callback that links their shop into the
 * victim's workspace.
 */

export function buildAuthorizeUrl(opts: {
  shopDomain: string;
  apiKey: string;
  scopes: string[];
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.apiKey,
    scope: opts.scopes.join(","),
    redirect_uri: opts.redirectUri,
    state: opts.state,
    "grant_options[]": "", // per-user vs offline — empty = offline (long-lived)
  });
  return `https://${opts.shopDomain}/admin/oauth/authorize?${params}`;
}

/** Build a signed state token. Contains org_id + nonce. */
export function signState(orgId: string, apiSecret: string): string {
  const nonce = randomBytes(16).toString("hex");
  const payload = `${orgId}.${nonce}.${Date.now()}`;
  const sig = createHmac("sha256", apiSecret).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

/** Verify a state token and extract the org_id if valid. */
export function verifyState(
  state: string,
  apiSecret: string
): { ok: true; orgId: string } | { ok: false; reason: string } {
  let decoded: string;
  try {
    decoded = Buffer.from(state, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "Malformed state" };
  }
  const parts = decoded.split(".");
  if (parts.length !== 4) {
    return { ok: false, reason: "Invalid state format" };
  }
  const [orgId, nonce, ts, providedSig] = parts;
  const payload = `${orgId}.${nonce}.${ts}`;
  const expected = createHmac("sha256", apiSecret)
    .update(payload)
    .digest("hex");

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(providedSig);
  if (
    expectedBuf.length !== providedBuf.length ||
    !timingSafeEqual(expectedBuf, providedBuf)
  ) {
    return { ok: false, reason: "Signature mismatch" };
  }
  // State token max age: 30 minutes
  const age = Date.now() - parseInt(ts, 10);
  if (isNaN(age) || age > 30 * 60 * 1000) {
    return { ok: false, reason: "State expired" };
  }
  return { ok: true, orgId };
}

/**
 * Verify the HMAC Shopify includes as a query param on the OAuth callback.
 * This is separate from the state signature — Shopify signs the whole query
 * string with the app secret, and we verify it before trusting any param.
 */
export function verifyShopifyOauthCallback(
  searchParams: URLSearchParams,
  apiSecret: string
): boolean {
  const givenHmac = searchParams.get("hmac");
  if (!givenHmac) return false;

  // Reconstruct the signed message: alphabetically sorted params,
  // excluding `hmac` and `signature`, joined as &k=v
  const pairs: string[] = [];
  for (const [k, v] of searchParams.entries()) {
    if (k === "hmac" || k === "signature") continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const message = pairs.join("&");
  const expected = createHmac("sha256", apiSecret)
    .update(message)
    .digest("hex");

  const expectedBuf = Buffer.from(expected);
  const givenBuf = Buffer.from(givenHmac);
  if (expectedBuf.length !== givenBuf.length) return false;
  return timingSafeEqual(expectedBuf, givenBuf);
}

/** Exchange OAuth code for permanent access token. */
export async function exchangeCodeForToken(opts: {
  shopDomain: string;
  apiKey: string;
  apiSecret: string;
  code: string;
}): Promise<
  | { ok: true; accessToken: string; scope: string }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(
      `https://${opts.shopDomain}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: opts.apiKey,
          client_secret: opts.apiSecret,
          code: opts.code,
        }),
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Token exchange returned HTTP ${res.status}: ${text.slice(
          0,
          300
        )}`,
      };
    }
    const data = (await res.json()) as {
      access_token: string;
      scope: string;
    };
    return { ok: true, accessToken: data.access_token, scope: data.scope };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** Normalize user-input shop URL to "shop.myshopify.com". */
export function normalizeShopDomain(input: string): string | null {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}
