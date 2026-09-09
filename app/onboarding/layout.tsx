import { LogOut } from "lucide-react";
import { LogoWordmark } from "@/components/ui/LogoWordmark";
import { signOut } from "@/app/(auth)/actions";
import { ThemeToggle } from "@/components/nav/ThemeToggle";

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
      <header className="relative z-10 px-32 md:px-48 py-24 flex items-center justify-between gap-12">
        {/* Deliberately NOT a home link: "/" bounces membership-less users
            straight back here, and the old link wiped in-progress answers. */}
        <span className="inline-flex items-center text-text" aria-hidden>
          <LogoWordmark size="md" />
        </span>
        <div className="flex items-center gap-16">
          <span className="label-text text-text-muted hidden sm:inline">
            First-time setup
          </span>
          <ThemeToggle />
          {/* Escape hatch for wrong-account signins. */}
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex items-center gap-6 mono-sm text-text-muted hover:text-text transition-colors"
            >
              <LogOut size={11} strokeWidth={1.5} />
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="relative z-10 flex-1 flex items-start justify-center px-20 md:px-32 py-24 md:py-40">
        <div className="w-full max-w-[640px]">{children}</div>
      </section>
    </main>
  );
}
