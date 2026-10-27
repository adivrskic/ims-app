"use client";

import { useSyncExternalStore } from "react";
import { relTime } from "@/lib/format";

type Format = "time" | "date" | "datetime" | "relative";

interface Props {
  iso: string | null | undefined;
  format?: Format;
  /** Rendered when `iso` is null/invalid. */
  fallback?: string;
  className?: string;
}

const subscribe = () => () => {};

/**
 * Renders a timestamp in the viewer's own time zone.
 *
 * Server components run in UTC on Netlify, so `toLocaleTimeString()` there
 * prints London time for a warehouse in Ohio, and formatting in a client
 * component during hydration throws a mismatch instead. This renders a
 * zone-agnostic ISO string on the server and the local formatting after
 * mount, inside a `<time dateTime>` so the exact instant is always in the
 * markup.
 */
export function LocalTime({
  iso,
  format = "datetime",
  fallback = "—",
  className,
}: Props) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
  if (!iso) return <span className={className}>{fallback}</span>;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()))
    return <span className={className}>{fallback}</span>;

  let text: string;
  if (!mounted) {
    text =
      format === "relative"
        ? relTime(iso)
        : d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  } else if (format === "time") {
    text = d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } else if (format === "date") {
    text = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } else if (format === "relative") {
    text = relTime(iso);
  } else {
    text = d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
