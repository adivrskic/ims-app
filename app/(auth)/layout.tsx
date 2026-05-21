import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import { UnderwaterAtmosphere } from "@/components/effects/UnderwaterAtmosphere";
import type { CSSProperties } from "react";

/*
 * The override applies to header, form section, and footer — the
 * manifest direction has no card backdrop, so form text sits directly
 * on the underwater bg.
 *
 * Values come from --auth-* tokens defined in globals-underwater.css,
 * which means the entire chrome palette flips when the user toggles
 * light/dark (light → dark ink on lighter blue, dark → white ink on
 * deep blue).
 */
const chromeOverride: CSSProperties = {
  // @ts-expect-error - React.CSSProperties typing for CSS custom props
  "--text": "var(--auth-text)",
  "--text-secondary": "var(--auth-text-secondary)",
  "--text-muted": "var(--auth-text-muted)",
  "--text-dim": "var(--auth-text-dim)",
  "--border": "var(--auth-border)",
  "--border-subtle": "var(--auth-border-subtle)",
  "--border-hover": "var(--auth-border-hover)",
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
