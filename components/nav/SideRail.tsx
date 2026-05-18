"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronsLeft,
  ChevronsRight,
  Search,
  Bell,
  Command,
  Settings,
  Users,
  CreditCard,
  KeyRound,
  History,
  LogOut,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { NAV_GROUPS, findActiveHref, type NavItem } from "@/lib/navData";
import { WorkspaceSwitcher, type WorkspaceOption } from "./WorkspaceSwitcher";
import type { NotificationItem } from "./NotificationsDropdown";
import { ThemeToggle } from "./ThemeToggle";
import { signOut } from "@/app/(auth)/actions";
import { FacilitiesNavItem } from "./FacilitiesNavItem";
import type { FacilityOption } from "@/lib/currentFacility";

/** Cookie key shared with the server-side layout. */
const SIDEBAR_COOKIE = "nimbus-sidebar-collapsed";

const EXPANDED_WIDTH = 240;
const COLLAPSED_WIDTH = 56;

interface Props {
  user: { email: string; full_name?: string | null } | null;
  workspace: WorkspaceOption | null;
  workspaces: WorkspaceOption[];
  /** Accepted for parity with the old TopNav — the actual list lives at /notifications */
  notifications: NotificationItem[];
  unreadCount: number;
  /** SSR-rendered initial state from the cookie. Avoids hydration flicker. */
  initialCollapsed: boolean;
  facilities: FacilityOption[];
  currentFacilityId: string | null;
}

/**
 * SideRail — the primary navigation chrome.
 *
 * Absorbs everything the old TopNav carried:
 *   Header  : Logo + brand
 *   Top     : Workspace switcher (expanded only — dropdown opens DOWN, has room)
 *   Middle  : Nav groups w/ most-specific-match active highlighting.
 *             The Facilities row renders as a FacilitiesNavItem (button +
 *             popover for quick switching); every other row is a normal
 *             NavItemLink.
 *   Bottom  : Search → palette · Notifications link · Theme · User menu
 *   Footer  : Collapse toggle (⌘B)
 *
 * Notifications is a Link rather than a dropdown here. The original
 * NotificationsDropdown is 340px wide and opens downward — neither plays
 * nicely with a 240px sidebar bottom. The Link uses the same unread badge;
 * the /notifications page carries the full UX. Mobile keeps the bell icon
 * in MobileTopBar so it's always accessible.
 *
 * User menu IS still a dropdown — preserved because sign-out access matters.
 * It's a sidebar-specific custom popover that opens UPWARD (anchored
 * bottom-full) so it never clips off the viewport.
 *
 * Collapse state persists via cookie so SSR can render the correct width
 * on first paint. ⌘B toggles. Mobile (< md): hidden — see MobileNav drawer
 * and MobileTopBar.
 */
export function SideRail({
  user,
  workspace,
  workspaces,
  unreadCount,
  initialCollapsed,
  facilities,
  currentFacilityId,
}: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  useEffect(() => {
    document.cookie = `${SIDEBAR_COOKIE}=${collapsed}; path=/; max-age=${
      60 * 60 * 24 * 365
    }; SameSite=Lax`;
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== "b") return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        t?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      setCollapsed((c) => !c);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openPalette = () => {
    window.dispatchEvent(new Event("open-command-palette"));
  };

  const allItems = useMemo(() => NAV_GROUPS.flatMap((g) => g.items), []);
  const activeHref = useMemo(
    () => findActiveHref(allItems, pathname),
    [allItems, pathname]
  );

  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  return (
    <aside
      className="hidden md:flex shrink-0 hairline-r  sticky top-0 self-start h-screen flex-col"
      style={{
        width,
        transition: "width 180ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      aria-label="Primary navigation"
      data-collapsed={collapsed}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div
        className={`h-56 hairline-b flex items-center shrink-0 ${
          collapsed ? "justify-center px-0" : "px-14"
        }`}
      >
        <Link
          href="/"
          className="flex items-center gap-8 text-text"
          aria-label="Nimbus home"
          title={collapsed ? "Nimbus home" : undefined}
        >
          <Logo size={18} />
          {!collapsed && (
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
          )}
        </Link>
      </div>

      {/* ── Workspace switcher ──────────────────────────────────────── */}
      {workspace && !collapsed && (
        <div className="px-10 py-10 hairline-b">
          <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
        </div>
      )}
      {workspace && collapsed && (
        <Link
          href="/settings"
          className="h-44 flex items-center justify-center hairline-b hover:bg-[var(--surface-2)] transition-colors"
          title={`${workspace.name} · open settings to switch`}
          aria-label={`Workspace: ${workspace.name}`}
        >
          <span
            className="w-22 h-22 bg-[var(--accent-dim)] flex items-center justify-center"
            aria-hidden
          >
            <span
              className="text-[var(--accent)]"
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {workspace.name.slice(0, 1).toUpperCase()}
            </span>
          </span>
        </Link>
      )}

      {/* ── Nav groups ──────────────────────────────────────────────── */}
      <nav
        className={`flex-1 overflow-y-auto flex flex-col ${
          collapsed ? "px-6 py-10 gap-10" : "px-10 py-14 gap-18"
        }`}
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <div className="px-10 mb-6">
                <span className="label-text">{group.label}</span>
              </div>
            )}
            <ul className="flex flex-col gap-1">
              {group.items.map((item) => {
                // Facilities gets the special switcher (button + popover).
                // Every other item renders as a normal Link.
                if (item.href === "/settings/facilities") {
                  return (
                    <FacilitiesNavItem
                      key={item.href}
                      label={item.label}
                      icon={item.icon}
                      manageHref={item.href}
                      active={item.href === activeHref}
                      collapsed={collapsed}
                      facilities={facilities}
                      currentFacilityId={currentFacilityId}
                    />
                  );
                }
                return (
                  <NavItemLink
                    key={item.href}
                    item={item}
                    active={item.href === activeHref}
                    collapsed={collapsed}
                  />
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <div
        className={`hairline-t shrink-0 flex flex-col ${
          collapsed ? "px-6 py-8 gap-6" : "px-10 py-10 gap-6"
        }`}
      >
        {/* Search → command palette */}
        <button
          type="button"
          onClick={openPalette}
          className={`hairline-subtle bg-[var(--surface-2)] hover:border-[var(--border-hover)] transition-colors text-text-secondary flex items-center ${
            collapsed ? "justify-center h-32 w-full" : "gap-8 px-10 py-7"
          }`}
          aria-label="Open command palette"
          title={collapsed ? "Search · ⌘K" : undefined}
        >
          <Search size={12} strokeWidth={1.5} className="shrink-0" />
          {!collapsed && (
            <>
              <span
                className="flex-1 text-left text-text-dim"
                style={{ fontFamily: "var(--mono)", fontSize: 11 }}
              >
                Search…
              </span>
              <span
                className="inline-flex items-center gap-3 text-text-dim shrink-0"
                style={{ fontFamily: "var(--mono)", fontSize: 10 }}
              >
                <Command size={9} strokeWidth={1.5} />
                <span>K</span>
              </span>
            </>
          )}
        </button>

        {/* Notifications (link, not dropdown) + theme */}
        <div
          className={`flex items-center ${
            collapsed ? "flex-col gap-6" : "gap-6"
          }`}
        >
          <Link
            href="/notifications"
            className={`relative hairline-subtle hover:border-[var(--border-hover)] text-text-secondary transition-colors flex items-center ${
              collapsed
                ? "justify-center h-28 w-full"
                : "gap-8 px-10 py-6 flex-1"
            }`}
            aria-label={`Notifications${
              unreadCount > 0 ? `, ${unreadCount} unread` : ""
            }`}
            title={collapsed ? "Notifications" : undefined}
          >
            <Bell size={12} strokeWidth={1.5} className="shrink-0" />
            {!collapsed && (
              <span
                className="flex-1 text-left text-text-secondary"
                style={{ fontFamily: "var(--mono)", fontSize: 11 }}
              >
                Notifications
              </span>
            )}
            {unreadCount > 0 && (
              <span
                className={
                  collapsed
                    ? "absolute -top-2 -right-2 bg-[var(--accent)] text-[var(--black)] tnum"
                    : "bg-[var(--accent)] text-[var(--black)] tnum"
                }
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
          <ThemeToggle />
        </div>

        {/* User menu (custom, opens upward) */}
        {user && <SidebarUserMenu user={user} collapsed={collapsed} />}

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={`hairline-subtle hover:border-[var(--border-hover)] text-text-muted hover:text-text transition-colors flex items-center ${
            collapsed
              ? "justify-center h-28 w-full mt-4"
              : "justify-center gap-6 px-10 py-6 mt-4"
          }`}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={`${collapsed ? "Expand" : "Collapse"} sidebar · ⌘B`}
        >
          {collapsed ? (
            <ChevronsRight size={11} strokeWidth={1.5} />
          ) : (
            <>
              <ChevronsLeft size={11} strokeWidth={1.5} />
              <span className="label-text">Collapse</span>
              <span
                className="ml-auto inline-flex items-center gap-3 text-text-dim"
                style={{ fontFamily: "var(--mono)", fontSize: 9 }}
              >
                <Command size={8} strokeWidth={1.5} />B
              </span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

// ─── Nav item link ──────────────────────────────────────────────────────

function NavItemLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const soon = item.status === "soon";

  return (
    <li>
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={`relative flex items-center transition-all duration-200 ${
          collapsed ? "justify-center h-32 w-full" : "gap-10 px-10 py-7"
        } ${
          active
            ? "bg-[var(--accent-dim)] text-[var(--accent)]"
            : "text-text-secondary hover:text-text hover:bg-[var(--surface-2)]"
        } ${soon ? "opacity-50" : ""}`}
        aria-current={active ? "page" : undefined}
      >
        {active && !collapsed && (
          <span
            className="absolute left-0 top-2 bottom-2 w-px bg-[var(--accent)]"
            aria-hidden
          />
        )}
        <Icon size={13} strokeWidth={1.5} />
        {!collapsed && (
          <span
            className="flex-1 truncate"
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
            }}
          >
            {item.label}
          </span>
        )}
      </Link>
    </li>
  );
}

// ─── User menu (custom upward-opening for the sidebar footer) ───────────

const USER_MENU_ITEMS: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}> = [
  { href: "/settings", label: "Account", icon: Settings },
  { href: "/settings/members", label: "Team", icon: Users },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/settings/api-keys", label: "API keys", icon: KeyRound },
  { href: "/settings/audit", label: "Audit log", icon: History },
];

function SidebarUserMenu({
  user,
  collapsed,
}: {
  user: { email: string; full_name?: string | null };
  collapsed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = (user.full_name || user.email)
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const firstName = (user.full_name || user.email.split("@")[0]).split(" ")[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`hairline-subtle hover:border-[var(--border-hover)] transition-colors flex items-center w-full ${
          collapsed ? "justify-center h-32" : "gap-8 px-8 py-5"
        }`}
        aria-label="Account menu"
        aria-expanded={open}
        title={collapsed ? user.email : undefined}
      >
        <span
          className="w-20 h-20 rounded-full bg-[var(--accent)] text-[var(--black)] flex items-center justify-center shrink-0"
          aria-hidden
        >
          <span
            style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600 }}
          >
            {initials}
          </span>
        </span>
        {!collapsed && (
          <span className="label-text text-text-secondary truncate flex-1 text-left">
            {firstName}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-8 w-[220px] hairline bg-[var(--surface)] flex flex-col"
          style={{ zIndex: 50 }}
        >
          <header className="px-14 py-10 hairline-b">
            <p
              className="text-text truncate"
              style={{
                fontFamily: "var(--display)",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {user.full_name || firstName}
            </p>
            <p
              className="mono-sm text-text-muted truncate"
              style={{ fontSize: 11 }}
            >
              {user.email}
            </p>
          </header>

          <nav className="py-4">
            {USER_MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-10 px-14 py-8 text-text-secondary hover:text-text hover:bg-[var(--surface-2)] transition-colors"
                >
                  <Icon size={12} strokeWidth={1.5} />
                  <span className="label-text">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="hairline-t">
            <form action={signOut}>
              <button
                type="submit"
                className="w-full flex items-center gap-10 px-14 py-10 text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-colors"
              >
                <LogOut size={12} strokeWidth={1.5} />
                <span className="label-text">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
