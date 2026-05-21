"use client";

import { usePathname } from "next/navigation";

// Builder + viewer both deserve the full screen. The sections detail
// page stays in normal padded chrome so it sits beside other inventory
// pages stylistically.
const FULLSCREEN_PATTERNS: RegExp[] = [
  /^\/facilities\/[^/]+\/builder(?:\/.*)?$/,
  /^\/facilities\/[^/]+$/,
];

const isFullscreen = (pathname: string) =>
  FULLSCREEN_PATTERNS.some((p) => p.test(pathname));

/**
 * The variable layer inside `<main>` for the authenticated app.
 *
 * Lives as a client component so we can read the pathname without
 * converting the parent layout (which performs server-side auth and
 * workspace fetches). The parent supplies `<main className="... relative">`;
 * we either fill it absolutely (fullscreen routes) or render the standard
 * padded surface with the dot-grid backdrop (everything else).
 */
export function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isFullscreen(pathname)) {
    // Pin to the visible area below the TopNav (which is 56px tall) and add
    // the same gutter padding the rest of the app uses, just without the
    // max-width cap so the surface uses all available width.
    return (
      <div
        className="flex flex-col overflow-hidden bg-[var(--bg)] px-20 md:px-32 lg:px-40 py-20 md:py-28"
        style={{ height: "calc(100vh - 56px)" }}
      >
        {children}
      </div>
    );
  }

  return (
    <>
      <div
        className="absolute inset-0 dot-grid opacity-40 pointer-events-none"
        aria-hidden
      />
      <div
        data-app-main
        className="relative max-w-[1480px] px-20 md:px-32 lg:px-40 py-24 md:py-40"
      >
        {children}
      </div>
    </>
  );
}
