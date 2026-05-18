"use client";

import Link from "next/link";
import { Menu, Search, Bell } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

interface Props {
  unreadCount: number;
}

/**
 * Mobile-only top bar.
 *
 * Replaces the old TopNav on viewports < md. Just three things the user
 * needs at all times: brand (Home link), notifications, and the hamburger
 * to open the MobileNav drawer (which carries everything else: nav, search,
 * workspace, user menu).
 *
 * Hidden on md+ — the desktop sidebar absorbs all of this.
 */
export function MobileTopBar({ unreadCount }: Props) {
  const openMobileNav = () => {
    window.dispatchEvent(new Event("open-mobile-nav"));
  };
  const openPalette = () => {
    window.dispatchEvent(new Event("open-command-palette"));
  };

  return (
    <header
      className="md:hidden h-52 hairline-b bg-[var(--bg)]/85 sticky top-0 flex items-center px-16 gap-10"
      style={{ zIndex: 40, backdropFilter: "blur(8px)" }}
    >
      <Link
        href="/"
        className="flex items-center gap-8 text-text"
        aria-label="Nimbus home"
      >
        <Logo size={18} />
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "2.5px",
            fontWeight: 500,
          }}
        >
          NIMBUS
        </span>
      </Link>

      <div className="flex-1" />

      <button
        type="button"
        onClick={openPalette}
        className="hairline-subtle p-7 hover:border-[var(--border-hover)] text-text-secondary transition-colors"
        aria-label="Open command palette"
      >
        <Search size={13} strokeWidth={1.5} />
      </button>

      <Link
        href="/notifications"
        className="relative hairline-subtle p-7 hover:border-[var(--border-hover)] text-text-secondary transition-colors"
        aria-label={`Notifications${
          unreadCount > 0 ? `, ${unreadCount} unread` : ""
        }`}
      >
        <Bell size={13} strokeWidth={1.5} />
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
      </Link>

      <button
        type="button"
        onClick={openMobileNav}
        className="hairline-subtle p-7 hover:border-[var(--border-hover)] text-text-secondary transition-colors"
        aria-label="Open menu"
      >
        <Menu size={13} strokeWidth={1.5} />
      </button>
    </header>
  );
}
