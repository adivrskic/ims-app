import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { AuthAtmosphere } from "@/components/effects/AuthAtmosphere";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col">
      <AuthAtmosphere />

      <header className="relative z-10 px-32 sm:px-48 py-24">
        <Link
          href="/"
          className="inline-flex items-center gap-10 text-text"
          aria-label="Nimbus"
        >
          <Logo size={20} />
          <span className="label-text--lg">Nimbus</span>
        </Link>
      </header>

      <section className="relative z-10 flex-1 flex items-center justify-center px-24 py-32">
        <div
          className="w-full max-w-[440px] hairline-subtle p-32"
          style={{
            background: "rgba(0, 0, 0, 0.55)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
        >
          {children}
        </div>
      </section>

      <footer className="relative z-10 px-32 sm:px-48 py-24 flex items-center justify-between">
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
