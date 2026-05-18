import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import { UnderwaterAtmosphere } from "@/components/effects/UnderwaterAtmosphere";
import type { CSSProperties } from "react";

/*
 * The override now applies to the form section too — the manifest
 * direction has no card backdrop, so form text sits directly on the
 * underwater bg and needs to be light-colored regardless of the
 * user's theme preference.
 *
 * --border-subtle is what powers the hairlines between manifest rows
 * (`hairline-b`, `hairline-t`, and the CSS module's `.rowBorder`).
 * The override lifts it from "barely visible" to "comfortably readable
 * against deep water" — still subtle, not heavy.
 */
const chromeOverride: CSSProperties = {
  // @ts-expect-error - React.CSSProperties typing for CSS custom props
  "--text": "rgba(255, 255, 255, 0.92)",
  "--text-secondary": "rgba(255, 255, 255, 0.75)",
  "--text-muted": "rgba(255, 255, 255, 0.55)",
  "--text-dim": "rgba(255, 255, 255, 0.4)",
  "--border": "rgba(255, 255, 255, 0.25)",
  "--border-subtle": "rgba(255, 255, 255, 0.18)",
  "--border-hover": "rgba(255, 255, 255, 0.32)",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col relative">
      <UnderwaterAtmosphere />

      <header
        className="relative z-10 px-32 sm:px-48 py-24 flex items-center justify-between"
        style={chromeOverride}
      >
        <Link
          href="/"
          className="inline-flex items-center gap-10"
          aria-label="Nimbus"
          style={{ color: "var(--text)" }}
        >
          <Logo size={20} />
          <span className="label-text--lg" style={{ color: "var(--text)" }}>
            Nimbus
          </span>
        </Link>
        <ThemeToggle />
      </header>

      {/*
        Section now uses the chrome override too. The form floats on the
        underwater bg with no card backdrop — every input is transparent
        on water, every label is white-on-water.
      */}
      <section
        className="relative z-10 flex-1 flex items-center justify-center px-24 py-32"
        style={chromeOverride}
      >
        <div className="w-full max-w-[500px]">{children}</div>
      </section>

      <footer
        className="relative z-10 px-32 sm:px-48 py-24 flex items-center justify-between"
        style={chromeOverride}
      >
        <p className="label-text">© Nimbus WMS</p>
        <nav className="flex items-center gap-20">
          <Link
            href="https://nimbuswms.com/legal/privacy"
            className="label-text hover:text-text transition-colors"
          >
            Privacy
          </Link>
          <Link
            href="https://nimbuswms.com/legal/terms"
            className="label-text hover:text-text transition-colors"
          >
            Terms
          </Link>
        </nav>
      </footer>
    </main>
  );
}
