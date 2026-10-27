import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  buildShopifyHmacMessage,
  verifyShopifyOauthCallback,
} from "@/lib/integrations/shopify/oauth";

describe("buildShopifyHmacMessage", () => {
  it("drops hmac and signature, sorts the pairs and joins with &", () => {
    const params = new URLSearchParams({
      shop: "demo.myshopify.com",
      hmac: "deadbeef",
      signature: "ignored",
      code: "abc",
      timestamp: "1700000000",
    });
    expect(buildShopifyHmacMessage(params.entries())).toBe(
      "code=abc&shop=demo.myshopify.com&timestamp=1700000000"
    );
  });

  it("escapes %, & and = in both keys and values per Shopify's spec", () => {
    const entries: Array<[string, string]> = [
      ["host", "YWRtaW4uc2hvcGlmeS5jb20=="],
      ["a&b", "x=y%z"],
    ];
    expect(buildShopifyHmacMessage(entries)).toBe(
      "a%26b=x%3Dy%25z&host=YWRtaW4uc2hvcGlmeS5jb20%3D%3D"
    );
  });

  it("escapes % first so later escapes are not double-encoded", () => {
    // If & were escaped before %, "%26" would become "%2526".
    expect(buildShopifyHmacMessage([["k", "&"]])).toBe("k=%26");
    expect(buildShopifyHmacMessage([["k", "%26"]])).toBe("k=%2526");
  });

  it("sorts by the escaped pair, not the raw key", () => {
    const entries: Array<[string, string]> = [
      ["b", "1"],
      ["a", "2"],
    ];
    expect(buildShopifyHmacMessage(entries)).toBe("a=2&b=1");
  });
});

describe("verifyShopifyOauthCallback", () => {
  const secret = "shpss_test_secret";

  function sign(params: Record<string, string>): URLSearchParams {
    const sp = new URLSearchParams(params);
    const message = buildShopifyHmacMessage(sp.entries());
    const hmac = createHmac("sha256", secret).update(message).digest("hex");
    sp.set("hmac", hmac);
    return sp;
  }

  it("accepts a callback whose host value carries base64 padding", () => {
    const sp = sign({
      code: "0907a61c0c8d55e99db179b68161bc00",
      shop: "demo.myshopify.com",
      state: "abc.def.123.sig",
      timestamp: "1700000000",
      host: "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvZGVtbw==",
    });
    expect(verifyShopifyOauthCallback(sp, secret)).toBe(true);
  });

  it("rejects a tampered parameter", () => {
    const sp = sign({
      code: "abc",
      shop: "demo.myshopify.com",
      timestamp: "1700000000",
    });
    sp.set("shop", "evil.myshopify.com");
    expect(verifyShopifyOauthCallback(sp, secret)).toBe(false);
  });

  it("rejects a missing hmac", () => {
    const sp = new URLSearchParams({ code: "abc" });
    expect(verifyShopifyOauthCallback(sp, secret)).toBe(false);
  });
});
