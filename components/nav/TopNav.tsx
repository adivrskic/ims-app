"use client";

import { Search, Command, Menu } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { WorkspaceSwitcher, type WorkspaceOption } from "./WorkspaceSwitcher";
import {
  NotificationsDropdown,
  type NotificationItem,
} from "./NotificationsDropdown";
import { UserMenu } from "./UserMenu";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  user: { email: string; full_name?: string | null } | null;
  workspace: WorkspaceOption | null;
  workspaces: WorkspaceOption[];
  notifications: NotificationItem[];
  unreadCount: number;
}

export function TopNav({
  user,
  workspace,
  workspaces,
  notifications,
  unreadCount,
}: Props) {
  const openPalette = () => {
    window.dispatchEvent(new Event("open-command-palette"));
  };
  const openMobileNav = () => {
    window.dispatchEvent(new Event("open-mobile-nav"));
  };

  return (
    <header className="h-56 hairline-b bg-[var(--bg)] flex items-center px-16 md:px-20 gap-10 md:gap-14 sticky top-0 z-40 backdrop-blur-sm">
      <button
        type="button"
        onClick={openMobileNav}
        className="md:hidden hairline-subtle p-6 hover:border-[var(--border-hover)] text-text-secondary"
        aria-label="Open menu"
      >
        <Menu size={14} strokeWidth={1.5} />
      </button>

      <Link
        href="/"
        className="flex items-center gap-8 text-text"
        aria-label="Nimbus home"
      >
        <Logo size={18} />
        <span
          className="hidden sm:inline"
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

      {workspace && (
        <>
          <div
            className="hidden md:block h-14 w-px bg-[var(--border-subtle)] mx-2"
            aria-hidden
          />
          <div className="hidden md:block">
            <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
          </div>
        </>
      )}

      {/* Desktop search bar — opens command palette */}
      <button
        type="button"
        onClick={openPalette}
        className="hidden md:flex flex-1 max-w-[440px] mx-auto items-center gap-8 px-10 py-6 hairline-subtle bg-[var(--surface-2)] transition-colors hover:border-[var(--border-hover)] text-left cursor-text"
        aria-label="Open command palette"
      >
        <Search
          size={12}
          strokeWidth={1.5}
          className="text-text-dim shrink-0"
          aria-hidden
        />
        <span
          className="flex-1 text-text-dim"
          style={{ fontFamily: "var(--mono)", fontSize: 12 }}
        >
          Search products, locations, scans…
        </span>
        <span
          className="inline-flex items-center gap-3 text-text-dim shrink-0"
          style={{ fontFamily: "var(--mono)", fontSize: 10 }}
        >
          <Command size={9} strokeWidth={1.5} />
          <span>K</span>
        </span>
      </button>

      {/* Spacer pushes right cluster to the edge on mobile */}
      <div className="md:hidden flex-1" />

      {/* Mobile search icon — same palette */}
      <button
        type="button"
        onClick={openPalette}
        className="md:hidden hairline-subtle p-6 hover:border-[var(--border-hover)] text-text-secondary"
        aria-label="Open command palette"
      >
        <Search size={12} strokeWidth={1.5} />
      </button>

      <NotificationsDropdown
        notifications={notifications}
        unreadCount={unreadCount}
      />

      <ThemeToggle />

      <span className="dot dot-live hidden md:inline" aria-hidden />

      {user ? (
        <UserMenu user={user} />
      ) : (
        <span className="label-text text-text-dim">Not signed in</span>
      )}
    </header>
  );
}
