import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerButton } from "@/components/ui/CornerButton";
import { Bell, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { NotificationsRealtime } from "@/components/realtime/PageRealtime";
import { markAllNotificationsRead } from "../actions";

export const metadata = { title: "Notifications" };

interface NotificationRow {
  id: string;
  kind: string | null;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string | null;
}

const KIND_TONE: Record<string, string> = {
  stock_alert: "var(--warning)",
  scan_summary: "var(--info)",
  system: "var(--text-muted)",
  member: "var(--accent)",
};

const FILTERS: Array<{
  key: string;
  label: string;
  test: (n: NotificationRow) => boolean;
}> = [
  { key: "all", label: "All", test: () => true },
  { key: "unread", label: "Unread", test: (n) => !n.read_at },
  {
    key: "stock_alert",
    label: "Stock alerts",
    test: (n) => n.kind === "stock_alert",
  },
  { key: "system", label: "System", test: (n) => n.kind === "system" },
  { key: "member", label: "Team", test: (n) => n.kind === "member" },
  {
    key: "scan_summary",
    label: "Scan summaries",
    test: (n) => n.kind === "scan_summary",
  },
];

const PAGE_SIZE = 25;

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const { filter: rawFilter, page: rawPage } = await searchParams;
  const activeFilter = FILTERS.find((f) => f.key === rawFilter) ?? FILTERS[0];
  const page = Math.max(1, parseInt(rawPage ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch ALL notifications (no row cap for filter-aware paging math),
  // then apply the active filter + slice on the server. For workspaces with
  // thousands of notifications we'd push this to the query, but at our seed
  // size + reality of inbox sizes (low hundreds), this is fine.
  const { data: allData } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const all = (allData ?? []) as NotificationRow[];
  const unreadTotal = all.filter((n) => !n.read_at).length;

  // Per-chip counts
  const counts = new Map<string, number>();
  for (const f of FILTERS) {
    counts.set(f.key, all.filter(f.test).length);
  }

  const filtered = all.filter(activeFilter.test);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice(offset, offset + PAGE_SIZE);

  return (
    <div className="flex flex-col gap-32">
      <NotificationsRealtime userId={user.id} />
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="Stock alerts, scan summaries, system events, and team activity for your workspaces."
        meta={[
          { label: "Total", value: all.length },
          {
            label: "Unread",
            value: unreadTotal,
            status: unreadTotal > 0 ? ("live" as const) : undefined,
          },
        ]}
        actions={
          unreadTotal > 0 ? (
            <form action={markAllNotificationsRead}>
              <CornerButton type="submit" variant="primary" size="sm">
                <Check size={11} strokeWidth={1.5} />
                Mark all read
              </CornerButton>
            </form>
          ) : undefined
        }
      />

      <nav
        className="flex items-center gap-2 hairline-b overflow-x-auto"
        aria-label="Filter notifications"
      >
        {FILTERS.map((f) => {
          const isActive = f.key === activeFilter.key;
          const chipCount = counts.get(f.key) ?? 0;
          return (
            <Link
              key={f.key}
              href={
                f.key === "all"
                  ? "/notifications"
                  : `/notifications?filter=${f.key}`
              }
              className={`relative px-12 py-10 transition-colors whitespace-nowrap flex items-center gap-8 ${
                isActive
                  ? "text-[var(--accent)]"
                  : "text-text-muted hover:text-text"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="label-text">{f.label}</span>
              <span
                className={`tnum ${
                  isActive ? "text-[var(--accent)]" : "text-text-dim"
                }`}
                style={{ fontFamily: "var(--mono)", fontSize: 10 }}
              >
                {chipCount}
              </span>
              {isActive && (
                <span
                  className="absolute left-0 right-0 bottom-0 h-px bg-[var(--accent)]"
                  aria-hidden
                  style={{ bottom: -1 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title={
            activeFilter.key === "all"
              ? "No notifications yet"
              : `Nothing matches “${activeFilter.label}”`
          }
          description="Stock alerts, scan summaries, system events, and team activity will show up here as they happen."
          icon={<Bell size={20} strokeWidth={1.5} />}
        />
      ) : (
        <>
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {rows.map((n) => {
              const tone = KIND_TONE[n.kind ?? ""] ?? "var(--text-muted)";
              const unread = !n.read_at;
              return (
                <li key={n.id}>
                  <NotificationRow
                    notification={n}
                    tone={tone}
                    unread={unread}
                  />
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <nav
              className="flex items-center justify-between"
              aria-label="Notifications pagination"
            >
              <Link
                href={
                  page === 1
                    ? "#"
                    : `/notifications?filter=${activeFilter.key}&page=${
                        page - 1
                      }`
                }
                className={`hairline-subtle px-12 py-6 inline-flex items-center gap-6 transition-colors ${
                  page === 1
                    ? "opacity-40 pointer-events-none"
                    : "hover:border-[var(--border-hover)] text-text-secondary hover:text-text"
                }`}
                aria-disabled={page === 1}
              >
                <ChevronLeft size={11} strokeWidth={1.5} />
                <span className="label-text">Previous</span>
              </Link>
              <p className="label-text text-text-muted">
                Page {page} of {totalPages}
              </p>
              <Link
                href={
                  page >= totalPages
                    ? "#"
                    : `/notifications?filter=${activeFilter.key}&page=${
                        page + 1
                      }`
                }
                className={`hairline-subtle px-12 py-6 inline-flex items-center gap-6 transition-colors ${
                  page >= totalPages
                    ? "opacity-40 pointer-events-none"
                    : "hover:border-[var(--border-hover)] text-text-secondary hover:text-text"
                }`}
                aria-disabled={page >= totalPages}
              >
                <span className="label-text">Next</span>
                <ChevronRight size={11} strokeWidth={1.5} />
              </Link>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function NotificationRow({
  notification: n,
  tone,
  unread,
}: {
  notification: NotificationRow;
  tone: string;
  unread: boolean;
}) {
  const inner = (
    <div
      className={`px-20 py-14 flex items-start gap-14 transition-colors ${
        unread ? "bg-[var(--surface-2)]" : ""
      } hover:bg-[var(--surface-3)]`}
    >
      <span
        className="shrink-0 mt-6"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: unread ? tone : "transparent",
        }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-10 mb-2">
          <p
            className="text-text truncate"
            style={{
              fontFamily: "var(--display)",
              fontSize: 14,
              fontWeight: unread ? 600 : 500,
            }}
          >
            {n.title}
          </p>
          <time
            className="mono-sm text-text-dim shrink-0"
            dateTime={n.created_at ?? undefined}
            style={{ fontSize: 11 }}
          >
            {timeAgo(n.created_at)}
          </time>
        </div>
        {n.body && (
          <p
            className="mono-sm text-text-muted mt-4"
            style={{ fontSize: 12, lineHeight: 1.55 }}
          >
            {n.body}
          </p>
        )}
        {n.kind && (
          <p className="label-text text-text-dim mt-6" style={{ fontSize: 9 }}>
            {n.kind.replace("_", " ")}
          </p>
        )}
      </div>
    </div>
  );

  if (n.link) {
    return (
      <Link href={n.link} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
