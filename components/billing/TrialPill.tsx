"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatDaysLeft, type Entitlement } from "@/lib/entitlement";
import { useLiveEntitlement } from "@/lib/useLiveEntitlement";

interface Props {
  entitlement: Entitlement;
  /** billing.manage holders get a link to billing; everyone else, plain text. */
  canManageBilling: boolean;
  /**
   * full  — "5 days left in your trial" (expanded side rail)
   * short — "5d left" (mobile top bar)
   * tiny  — "5d" (collapsed side rail)
   * The full sentence is the accessible name in every variant.
   */
  variant?: "full" | "short" | "tiny";
  /** Classes for the outer element, including its display. */
  className?: string;
}

/**
 * The app shell's free-trial countdown. Renders nothing unless the active
 * workspace is on a running trial; the final two days switch to the warning
 * tone. useLiveEntitlement keeps the count honest in a tab left open for days.
 */
export function TrialPill({
  entitlement,
  canManageBilling,
  variant = "full",
  className = "block",
}: Props) {
  const live = useLiveEntitlement(entitlement);
  if (live.state !== "trial" || live.daysLeft === null) return null;

  const sentence = `${formatDaysLeft(live.daysLeft)} in your trial`;
  const label =
    variant === "full"
      ? sentence
      : variant === "short"
      ? `${live.daysLeft}d left`
      : `${live.daysLeft}d`;

  const pill = (
    <Badge
      tone={live.daysLeft <= 2 ? "warning" : "info"}
      className={variant === "full" ? "w-full justify-center" : undefined}
    >
      <span className="tnum" aria-hidden={variant === "full" ? undefined : true}>
        {label}
      </span>
      {variant !== "full" && <span className="sr-only">{sentence}</span>}
    </Badge>
  );

  if (!canManageBilling) {
    return (
      <div
        className={className}
        title={variant === "full" ? undefined : sentence}
      >
        {pill}
      </div>
    );
  }

  return (
    <Link
      href="/settings/billing"
      className={`${className} transition-opacity hover:opacity-80`}
      title={`${sentence} — choose a plan`}
    >
      {pill}
      <span className="sr-only">, choose a plan</span>
    </Link>
  );
}
