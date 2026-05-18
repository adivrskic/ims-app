import type { ProviderInfo } from "@/app/(app)/integrations/providers";

/*
 * Map ProviderInfo.key → simple-icons slug.
 *
 * simple-icons (https://simpleicons.org/) is a CC0 collection of brand
 * SVG logos. Their CDN at cdn.simpleicons.org serves each logo by slug —
 * `cdn.simpleicons.org/<slug>` returns the brand-color version,
 * `cdn.simpleicons.org/<slug>/<hex>` returns it in any color.
 *
 * We render WHITE logos inside a brand-color chip — high contrast on
 * every backdrop in both light and dark themes, doesn't rely on the
 * user's bg color cooperating with the brand color.
 *
 * Providers without a simple-icons entry (currently: shipstation) fall
 * back to the brand-color chip with initials — same shape, same colors,
 * just no glyph.
 */
const SLUGS: Record<string, string> = {
  shopify: "shopify",
  square: "square",
  woocommerce: "woocommerce",
  quickbooks: "intuitquickbooks",
  xero: "xero",
  stripe: "stripe",
  fedex: "fedex",
  slack: "slack",
  gmail: "gmail",
  resend: "resend",
  zapier: "zapier",
  hubspot: "hubspot",
};

interface Props {
  provider: ProviderInfo;
  /** Outer chip size in px. Default 44. */
  size?: number;
}

export function ProviderLogo({ provider, size = 44 }: Props) {
  const slug = SLUGS[provider.key];
  const innerSize = Math.round(size * 0.55);

  return (
    <span
      className="hairline-subtle shrink-0 flex items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        background: provider.brandColor,
      }}
      aria-hidden
    >
      {slug ? (
        <img
          src={`https://cdn.simpleicons.org/${slug}/ffffff`}
          alt=""
          width={innerSize}
          height={innerSize}
          loading="lazy"
          style={{ display: "block" }}
        />
      ) : (
        <span
          style={{
            color: "#fff",
            fontFamily: "var(--mono)",
            fontSize: Math.round(size * 0.3),
            fontWeight: 600,
            letterSpacing: "-0.5px",
          }}
        >
          {provider.initials}
        </span>
      )}
    </span>
  );
}
