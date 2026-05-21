// lib/useRealtimeRefresh.ts
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
}

/**
 * Subscribe to postgres_changes on one or more `app.*` tables and
 * call router.refresh() (debounced) when any of them change.
 *
 * RLS gates events to rows the user can read — no extra org filter needed.
 *
 * One-time DB setup per table (see SQL block at the bottom of this PR):
 *   alter publication supabase_realtime add table app.<name>;
 */
export function useRealtimeRefresh({
  subscriptions,
  debounceMs = 300,
  disabled = false,
  channelKey,
}: Options) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Serialize subscriptions so dep-array comparisons are by value, not identity.
  const subsKey =
    channelKey ??
    subscriptions
      .map((s) => `${s.table}:${s.event ?? "*"}:${s.filter ?? ""}`)
      .join("|");

  useEffect(() => {
    if (disabled) return;

    const supabase = createClient();
    const channel = supabase.channel(`refresh:${subsKey}`);

    const onChange = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => router.refresh(), debounceMs);
    };

    for (const sub of subscriptions) {
      channel.on(
        // @ts-expect-error - supabase-js types for postgres_changes are loose
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
  }, [subsKey, disabled, debounceMs, router]);
}
