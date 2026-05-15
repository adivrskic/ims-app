import type { Config } from "tailwindcss";

/**
 * Pixel-aligned spacing scale.
 *
 * Tailwind's default spacing scale treats numbers as 0.25rem increments,
 * so `p-16` becomes 64px, `gap-10` becomes 40px, etc. We want numbers to
 * literally mean pixels — `p-16` → 16px — so every component reads as
 * "the value the designer chose."
 *
 * Generated rather than hand-listed so values like 7, 14, 22, 36 don't
 * silently fall back to the default scale and produce 4× sized output.
 */
const PX_SPACING: Record<string, string> = (() => {
  const out: Record<string, string> = { px: "1px" };
  for (let i = 0; i <= 320; i++) out[i.toString()] = `${i}px`;
  return out;
})();

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        "border-subtle": "var(--border-subtle)",
        text: "var(--text)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        "text-dim": "var(--text-dim)",
        accent: "var(--accent)",
        "accent-dim": "var(--accent-dim)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)",
      },
      fontFamily: {
        display: "var(--display)",
        mono: "var(--mono)",
      },
      borderRadius: {
        none: "0",
        pill: "999px",
      },
      spacing: PX_SPACING,
      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
        smooth: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
