"use client";

import { useSearchParams } from "next/navigation";
import { KioskShell } from "./KioskShell";
import { KioskExit } from "./KioskExit";

/**
 * Client-side kiosk activator.
 *
 * Watches the `?kiosk=1` query param via useSearchParams (which updates on
 * client-side soft navigations — e.g. the Overview "Kiosk view" link). When
 * present, it mounts <KioskShell>, whose effect sets data-kiosk="true" on
 * <html> (the hook the globals.css wallboard rules key off of) and starts the
 * refresh + wake-lock backstops, plus the <KioskExit> pill. Removing the param
 * (Exit pill / Esc) unmounts the shell, whose cleanup removes the attribute.
 *
 * Why this is client-reactive rather than a server isKioskMode() check in the
 * layout: App Router does NOT re-run a shared layout's server render on a
 * query-only soft navigation, so a server check would only fire on a full page
 * load of ?kiosk=1 — clicking the link would do nothing. useSearchParams
 * re-renders on every navigation, so this reacts immediately.
 *
 * Mount once in the (app) layout, wrapped in <Suspense> (useSearchParams
 * requires a Suspense boundary).
 */
export function KioskGate() {
  const params = useSearchParams();
  const kiosk = params.get("kiosk") === "1";

  if (!kiosk) return null;

  return (
    <KioskShell>
      <KioskExit />
    </KioskShell>
  );
}