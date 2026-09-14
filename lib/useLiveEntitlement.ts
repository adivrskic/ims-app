"use client";

import { useEffect, useMemo, useState } from "react";
import { entitlementAt, type Entitlement } from "@/lib/entitlement";

/** How often a running trial re-checks the clock while the tab stays open. */
const TICK_MS = 60_000;

/**
 * An entitlement resolved on the server, kept current in the browser.
 *
 * The (app) layout doesn't re-render on client-side navigation, so the value it
 * resolved can sit in an open tab for days. While a trial is running this
 * re-evaluates it — through lib/entitlement.ts, no date maths here — every
 * minute and whenever the tab comes back into focus, so the day count stays
 * right and the moment the trial ends is noticed. The first render always uses
 * the server's value, which keeps hydration stable.
 */
export function useLiveEntitlement(resolved: Entitlement): Entitlement {
  const { state, trialEndsAt, daysLeft } = resolved;
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // Only a running trial changes with the clock.
    if (state !== "trial") return;
    const tick = () => setNow(Date.now());
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [state, trialEndsAt]);

  return useMemo(() => {
    const base: Entitlement = { state, trialEndsAt, daysLeft };
    return now === null ? base : entitlementAt(base, now);
  }, [state, trialEndsAt, daysLeft, now]);
}
