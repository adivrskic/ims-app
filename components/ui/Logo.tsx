import { useId } from "react";

/**
 * Nimbus logo glyph.
 *
 * The N is cut from a `currentColor`-filled square via an SVG mask, so the
 * glyph renders as a hairline-precise letterform against any background and
 * inherits the surrounding text color. Used in the top nav and on every
 * auth/onboarding surface.
 */
interface Props {
  size?: number;
  className?: string;
  title?: string;
}

export function Logo({ size = 22, className, title = "Nimbus" }: Props) {
  const maskId = useId();
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        <mask id={maskId}>
          <rect width="32" height="32" fill="white" />
          <text
            x="16"
            y="27.5"
            textAnchor="middle"
            fontFamily="'Arial Black','Helvetica Neue',Arial,sans-serif"
            fontWeight="900"
            fontSize="32"
            fill="black"
          >
            N
          </text>
        </mask>
      </defs>
      <rect width="32" height="32" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}
