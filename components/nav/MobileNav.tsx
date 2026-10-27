"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, HelpCircle, ChevronDown } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { resolveUserNav, type NavPrefs } from "@/lib/navData";
import { useDialog } from "@/lib/useDialog";

interface Props {
  /** Workspace industry slug — drives which items show by default. */
  industry: string | null;
  /** Per-user nav customization (overrides workspace defaults when set). */
  navPrefs: NavPrefs | null;
  /** Org modules enabled at onboarding (between industry and user prefs). */
  orgModules: string[] | null;
}

export function MobileNav({ industry, navPrefs, orgModules }: Props) {
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();

  // Same resolver as SideRail, so onboarding/nav choices apply on mobile too.
  const { groups: navGroups, more: moreItems } = useMemo(
    () => resolveUserNav(industry, navPrefs, orgModules),
    [industry, navPrefs, orgModules]
  );

  // Listen for hamburger event
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("open-mobile-nav", onOpen);
    return () => window.removeEventListener("open-mobile-nav", onOpen);
  }, []);

  // Close when navigation occurs (path changes)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Focus the close button on open, trap Tab inside, close on Escape, lock
  // the page scroll, and hand focus back to the hamburger on close.
  const closeRef = useRef<HTMLButtonElement>(null);
  const onClose = useCallback(() => setOpen(false), []);
  const drawerRef = useDialog({
    open,
    onClose,
    initialFocus: closeRef,
    lockScroll: true,
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className={`md:hidden fixed inset-0 transition-opacity duration-200 ${
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        style={{
          zIndex: 90,
          background: "var(--scrim-heavy)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        className={`md:hidden fixed top-0 bottom-0 left-0 w-[280px] bg-[var(--bg)] hairline-r flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ zIndex: 100 }}
        aria-label="Navigation menu"
        // `inert` (not aria-hidden) so the off-screen links also leave the
        // Tab order and cannot be clicked through the transform.
        inert={!open}
        data-mobile-nav
      >
        <header className="h-56 hairline-b flex items-center justify-between px-16 shrink-0">
          <Link
            href="/"
            className="flex items-center gap-8 text-text"
            aria-label="Nautilus home"
            onClick={() => setOpen(false)}
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
              Nautilus
            </span>
          </Link>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            className="hairline-subtle p-6 hover:border-[var(--border-hover)] text-text-secondary"
            aria-label="Close menu"
          >
            <X size={12} strokeWidth={1.5} />
          </button>
        </header>

        <nav
          aria-label="Primary"
          className="flex-1 flex flex-col gap-20 px-10 py-16 overflow-y-auto"
        >
          {navGroups.map((group, gi) => (
            <div key={group.label ?? `g${gi}`}>
              {group.label && (
                <div className="px-10 mb-6">
                  <span className="label-text">{group.label}</span>
                </div>
              )}
              <ul className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <MobileNavLink
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </ul>
            </div>
          ))}

          {/* Items not primary for this workspace — reachable under "More". */}
          {moreItems.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                className="w-full flex items-center gap-6 px-10 mb-6 text-text-muted hover:text-text transition-colors"
                aria-expanded={moreOpen}
              >
                <span className="label-text">More</span>
                <ChevronDown
                  size={11}
                  strokeWidth={1.5}
                  className={`transition-transform ${
                    moreOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {moreOpen && (
                <ul className="flex flex-col gap-1">
                  {moreItems.map((item) => (
                    <MobileNavLink
                      key={item.href}
                      item={item}
                      pathname={pathname}
                      onNavigate={() => setOpen(false)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </nav>

        <div className="hairline-t px-10 py-10 shrink-0">
          <Link
            href="https://nautilusinventory.com/help"
            target="_blank"
            rel="noopener"
            onClick={() => setOpen(false)}
            className="flex items-center gap-10 px-10 py-8 text-text-muted hover:text-text transition-colors"
          >
            <HelpCircle size={12} strokeWidth={1.5} />
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
              }}
            >
              Help & docs
            </span>
          </Link>
        </div>
      </aside>
    </>
  );
}

function MobileNavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: { href: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> };
  pathname: string;
  onNavigate: () => void;
}) {
  const active =
    item.href === "/"
      ? pathname === "/"
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        className={`relative flex items-center gap-10 px-10 py-10 transition-colors ${
          active
            ? "bg-[var(--accent-dim)] text-[var(--accent)]"
            : "text-text-secondary hover:text-text hover:bg-[var(--surface-2)]"
        }`}
        aria-current={active ? "page" : undefined}
      >
        {active && (
          <span
            className="absolute left-0 top-0 bottom-0 w-px bg-[var(--accent)]"
            aria-hidden
          />
        )}
        <Icon size={14} strokeWidth={1.5} />
        <span
          className="flex-1"
          style={{
            fontFamily: "var(--mono)",
            fontSize: 12,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
          }}
        >
          {item.label}
        </span>
      </Link>
    </li>
  );
}
