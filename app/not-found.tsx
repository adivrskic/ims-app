import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { CornerLink as ButtonLink } from "@/components/ui/CornerButton";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="h-56 hairline-b flex items-center px-32">
        <Link href="/" className="flex items-center gap-10 text-text">
          <Logo size={20} />
          <span className="label-text--lg">Nimbus</span>
        </Link>
      </header>

      <section className="flex-1 relative flex items-center px-32 lg:px-80 overflow-hidden glow-tl">
        <div className="absolute inset-0 dot-grid opacity-60" aria-hidden />
        <div className="relative z-[1] max-w-[640px] brackets py-40 px-40">
          <p className="label-text--lg text-[var(--accent)] mb-20 flex items-center gap-12">
            <span className="inline-block w-24 h-px bg-[var(--accent)]" aria-hidden />
            404 · Off-grid
          </p>
          <h1 className="heading-lg mb-16">
            This bay isn&apos;t <span className="accent-italic">mapped</span>.
          </h1>
          <p className="body-text--display max-w-[520px] mb-32">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
            Head back to the floor and try again.
          </p>
          <ButtonLink href="/" variant="primary" size="sm">
            Back to overview →
          </ButtonLink>
        </div>
      </section>
    </main>
  );
}
