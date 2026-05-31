// lib/useRealtimeRefresh.ts
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { revalidateForTables } from "@/lib/revalidate";

interface TableSubscription {
  /** Postgres table name in the `app` schema. */
  table: string;
  /** Optional postgres-changes filter, e.g. "user_id=eq.<uuid>". */
  filter?: string;
  /** Which row events to watch. Default: all. */
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
}

interface Options {
  /** One or more tables to watch on a single channel. */
  subscriptions: TableSubscription[];
  /** Coalesce burst events. Default 300ms. */
  debounceMs?: number;
  /** Pause without unmounting. */
  disabled?: boolean;
  /** Override the channel name; defaults to a stable hash of subscriptions. */
  channelKey?: string;
  /**
   * When true (the default), a change first invalidates only the cache tags
   * mapped to the changed tables (via the revalidateForTables server action),
   * then calls router.refresh(). The refresh re-renders the page, but any
   * unstable_cache fetcher that wasn't tagged for these tables serves from
   * cache without hitting the DB — so a single changed row no longer re-runs
   * the whole page's queries.
   *
   * Set to false to fall back to the legacy behavior (router.refresh() only),
   * for pages whose data isn't yet behind tagged unstable_cache fetchers.
   */
  revalidateTags?: boolean;
}

/**
 * Subscribe to postgres_changes on one or more `app.*` tables and refresh
 * (debounced) when any of them change.
 *
 * RLS gates events to rows the user can read — no extra org filter needed.
 *
 * One-time DB setup per table:
 *   alter publication supabase_realtime add table app.<name>;
 */
export function useRealtimeRefresh({
  subscriptions,
  debounceMs = 300,
  disabled = false,
  channelKey,
  revalidateTags = true,
}: Options) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Serialize subscriptions so dep-array comparisons are by value, not identity.
  const subsKey =
    channelKey ??
    subscriptions
      .map((s) => `${s.table}:${s.event ?? "*"}:${s.filter ?? ""}`)
      .join("|");

  // Distinct table names this hook watches — passed to the revalidation
  // action so only the affected domains' cache tags are busted.
  const tablesKey = Array.from(
    new Set(subscriptions.map((s) => s.table))
  ).join(",");

  useEffect(() => {
    if (disabled) return;

    const supabase = createClient();
    const channel = supabase.channel(`refresh:${subsKey}`);
    const tables = tablesKey ? tablesKey.split(",") : [];

    const onChange = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        if (revalidateTags && tables.length > 0) {
          try {
            await revalidateForTables(tables);
          } catch {
            // Revalidation is best-effort; fall through to a plain refresh
            // so the user still sees fresh data even if the action failed.
          }
        }
        router.refresh();
      }, debounceMs);
    };

    for (const sub of subscriptions) {
      channel.on(
        "postgres_changes",
        {
          event: sub.event ?? "*",
          schema: "app",
          table: sub.table,
          ...(sub.filter ? { filter: sub.filter } : {}),
        },
        onChange
      );
    }

    channel.subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsKey, tablesKey, disabled, debounceMs, revalidateTags, router]);
}