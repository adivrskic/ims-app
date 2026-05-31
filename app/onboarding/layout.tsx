import Link from "next/link";
import { LogoWordmark } from "@/components/ui/LogoWordmark";

export const metadata = { title: "Set up workspace · Nautilus" };

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col relative">
      <div
        className="absolute inset-0 dot-grid opacity-40 pointer-events-none"
        aria-hidden
      />
      <header className="relative z-10 px-32 md:px-48 py-24 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center text-text"
          aria-label="Nautilus Inventory"
        >
          <LogoWordmark size="md" />
        </Link>
        <span className="label-text text-text-muted">First-time setup</span>
      </header>

      <section className="relative z-10 flex-1 flex items-start justify-center px-20 md:px-32 py-24 md:py-40">
        <div className="w-full max-w-[640px]">{children}</div>
      </section>
    </main>
  );
}
