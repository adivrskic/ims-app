import { Logo } from "@/components/ui/Logo";

/**
 * Nautilus lockup — the glyph next to a stacked wordmark:
 *
 *   ◧  Nautilus
 *      I N V E N T O R Y
 *
 * The "INVENTORY" sub-wordmark is rendered as individual letters in a
 * `justify-between` flex row pinned to `width: 100%` of the wrapping column.
 * Because the column sizes to its widest child ("Nautilus"), the letters
 * spread to exactly that width — no magic numbers. Mirrors the marketing-site
 * nav lockup so the brand reads identically across surfaces.
 *
 * Used in the SideRail header (expanded), the auth chrome, and onboarding.
 */
interface Props {
  /** sm = sidenav, md = auth/onboarding hero. */
  size?: "sm" | "md";
  className?: string;
}

const SIZES = {
  sm: { glyph: 18, name: 13, sub: 6.5, gap: 8, subGap: 2 },
  md: { glyph: 22, name: 16, sub: 8, gap: 10, subGap: 3 },
} as const;

export function LogoWordmark({ size = "sm", className }: Props) {
  const s = SIZES[size];
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: s.gap }}
    >
      <Logo size={s.glyph} title="Nautilus" />
      <span style={{ display: "inline-flex", flexDirection: "column" }}>
        <span
          style={{
            fontFamily: "var(--display)",
            fontWeight: 600,
            fontSize: s.name,
            letterSpacing: "0.5px",
            lineHeight: 1,
            color: "var(--text)",
          }}
        >
          Nautilus
        </span>
        <span
          aria-hidden
          style={{
            fontFamily: "var(--mono)",
            fontSize: s.sub,
            fontWeight: 400,
            textTransform: "uppercase",
            color: "var(--text-muted)",
            display: "flex",
            justifyContent: "space-between",
            width: "100%",
            lineHeight: 1,
            marginTop: s.subGap,
          }}
        >
          {"INVENTORY".split("").map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </span>
      </span>
    </span>
  );
}
