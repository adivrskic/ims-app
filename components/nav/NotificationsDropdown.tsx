"use client";

import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { useDropdown } from "@/lib/useDropdown";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/(app)/actions";

export interface NotificationItem {
  id: string;
  kind: string | null;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string | null;
}

interface Props {
  notifications: NotificationItem[];
  unreadCount: number;
}

const KIND_TONE: Record<string, string> = {
  stock_alert: "var(--warning)",
  scan_summary: "var(--info)",
  system: "var(--text-muted)",
  member: "var(--accent)",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

export function NotificationsDropdown({ notifications, unreadCount }: Props) {
  const { open, setOpen, ref } = useDropdown<HTMLDivElement>();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative hairline-subtle p-6 hover:border-[var(--border-hover)] transition-colors"
        aria-label={`Notifications${
          unreadCount > 0 ? `, ${unreadCount} unread` : ""
        }`}
      >
        <Bell size={12} strokeWidth={1.5} className="text-text-secondary" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-2 -right-2 bg-[var(--accent)] text-[var(--black)] tnum"
            style={{
              fontFamily: "var(--mono)",
              fontSize: 8,
              fontWeight: 600,
              padding: "1px 4px",
              minWidth: 12,
              textAlign: "center",
              lineHeight: 1.2,
            }}
            aria-hidden
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full right-0 mt-8 w-[340px] hairline bg-[var(--surface)] flex flex-col"
          style={{ zIndex: 50, maxHeight: 480 }}
        >
          <header className="px-14 py-10 hairline-b flex items-center justify-between">
            <div className="flex items-center gap-8">
              <span className="label-text">Notifications</span>
              {unreadCount > 0 && (
                <span
                  className="bg-[var(--accent-dim)] text-[var(--accent)] px-6 py-1 tnum"
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    fontWeight: 600,
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <form action={markAllNotificationsRead}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-4 text-text-muted hover:text-text transition-colors"
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                  }}
                >
                  <Check size={10} strokeWidth={1.5} />
                  Mark all read
                </button>
              </form>
            )}
          </header>

          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="px-14 py-32 text-center">
                <p className="mono-sm text-text-muted">No notifications yet</p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {notifications.map((n) => {
                  const tone = KIND_TONE[n.kind ?? ""] ?? "var(--text-muted)";
                  return (
                    <li key={n.id}>
                      <NotificationRow
                        notification={n}
                        tone={tone}
                        onActivate={() => setOpen(false)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="hairline-t">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-6 px-14 py-10 text-text-muted hover:text-text transition-colors"
            >
              <span className="label-text">View all notifications</span>
            </Link>
          </footer>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  notification: n,
  tone,
  onActivate,
}: {
  notification: NotificationItem;
  tone: string;
  onActivate: () => void;
}) {
  const unread = !n.read_at;

  const handleClick = async () => {
    if (unread) {
      await markNotificationRead(n.id);
    }
    onActivate();
  };

  const inner = (
    <div
      className={`px-14 py-12 flex items-start gap-10 transition-colors ${
        unread ? "bg-[var(--surface-2)]" : ""
      } hover:bg-[var(--surface-3)]`}
    >
      <span
        className="shrink-0"
        style={{
          width: 4,
          height: 4,
          borderRadius: "50%",
          background: unread ? tone : "transparent",
          marginTop: 8,
        }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-8 mb-2">
          <p
            className="text-text truncate"
            style={{
              fontFamily: "var(--display)",
              fontSize: 12,
              fontWeight: unread ? 600 : 500,
            }}
          >
            {n.title}
          </p>
          <span
            className="mono-sm text-text-dim shrink-0"
            style={{ fontSize: 10 }}
          >
            {timeAgo(n.created_at)}
          </span>
        </div>
        {n.body && (
          <p
            className="mono-sm text-text-muted line-clamp-2"
            style={{ fontSize: 11, lineHeight: 1.55 }}
          >
            {n.body}
          </p>
        )}
      </div>
    </div>
  );

  if (n.link) {
    return (
      <Link href={n.link} onClick={handleClick} className="block">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={handleClick} className="w-full text-left">
      {inner}
    </button>
  );
}
