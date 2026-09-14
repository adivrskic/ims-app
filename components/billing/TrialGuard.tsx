"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NautilusLoader } from "@/components/ui/NautilusLoader";
import { isTrialExemptPath, type Entitlement } from "@/lib/entitlement";
import { useLiveEntitlement } from "@/lib/useLiveEntitlement";

/**
 * While the client clock says the trial is over but the server hasn't agreed
 * yet (a little clock skew), ask again this often.
 */
const RECHECK_MS = 60_000;

/**
 * The browser half of the trial gate. The (app) layout redirects an expired
 * workspace to /trial-ended on every server render — but App Router doesn't
 * re-render a shared layout on client-side navigation, and the Router Cache
 * (staleTimes.dynamic = 120s in next.config.mjs) can show a recently visited
 * page without asking the server at all. That leaves two gaps:
 *
 *   1. The server already said "expired" and we're on an exempt page (billing,
 *      /workspaces/new). A soft navigation out of the exempt set — the side
 *      rail, ⌘K, a settings tab — goes to /trial-ended instead of rendering the
 *      page, behind a cover that hides it for the frame before that lands.
 *   2. The trial was still running when the layout rendered and has since run
 *      out in this open tab. Refresh, so the server decides. The client clock
 *      is never trusted to redirect on its own: a clock running fast would
 *      bounce between here and a /trial-ended page that disagrees.
 */
export function TrialGuard({ entitlement }: { entitlement: Entitlement }) {
  const router = useRouter();
  const pathname = usePathname();
  const live = useLiveEntitlement(entitlement);

  const mustLeave =
    entitlement.state === "expired" && !isTrialExemptPath(pathname);
  const ranOutInThisTab =
    entitlement.state === "trial" && live.state === "expired";

  useEffect(() => {
    if (mustLeave) router.replace("/trial-ended");
  }, [mustLeave, router]);

  useEffect(() => {
    if (!ranOutInThisTab) return;
    router.refresh();
    const id = window.setInterval(() => router.refresh(), RECHECK_MS);
    return () => window.clearInterval(id);
  }, [ranOutInThisTab, router]);

  if (!mustLeave) return null;
  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-[var(--bg)]"
      style={{ zIndex: 200 }}
    >
      <NautilusLoader label="Trial ended" />
    </div>
  );
}
