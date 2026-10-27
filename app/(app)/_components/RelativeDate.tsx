"use client";

import { useSyncExternalStore } from "react";
import { formatDate } from "@/lib/format";

interface Props {
  /** YYYY-MM-DD (a date-only column such as delivery_date / expected_date). */
  date: string | null | undefined;
  /** Rendered when `date` is null. */
  fallback?: string;
  /** Appended after " · " (e.g. the delivery window). */
  suffix?: string | null;
  /** Say "3d overdue" for past dates instead of the plain date. */
  overdue?: boolean;
  className?: string;
}

const subscribe = () => () => {};

/** "Today", "Tomorrow", "Yesterday", "In 3d", "3d overdue" or the date. */
export function relativeDateLabel(
  date: string,
  overdue: boolean,
  now = new Date()
): string {
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return date;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 0 && diff < 7) return `In ${diff}d`;
  if (overdue && diff < 0) return `${-diff}d overdue`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * "Today" / "Tomorrow" / "In 3d" for a date-only column, worked out in the
 * viewer's own zone. The server (UTC on Netlify) used to decide what "today"
 * was, so an evening in Ohio already read tomorrow's deliveries as "Today".
 * Renders the plain date on the server and swaps to the relative label after
 * mount, inside a `<time dateTime>` so the exact date is always in the markup.
 */
export function RelativeDate({
  date,
  fallback = "—",
  suffix,
  overdue = false,
  className,
}: Props) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
  if (!date) return <span className={className}>{fallback}</span>;
  const base = mounted ? relativeDateLabel(date, overdue) : formatDate(date);
  return (
    <time dateTime={date} className={className} suppressHydrationWarning>
      {suffix ? `${base} · ${suffix}` : base}
    </time>
  );
}
