"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { X, HelpCircle } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { NAV_GROUPS } from "@/lib/navData";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Listen for hamburger event
  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("open-mobile-nav", onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("open-mobile-nav", onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Close when navigation occurs (path changes)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

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
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        className={`md:hidden fixed top-0 bottom-0 left-0 w-[280px] bg-[var(--bg)] hairline-r flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ zIndex: 100 }}
        aria-label="Primary navigation"
        aria-hidden={!open}
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
            type="button"
            onClick={() => setOpen(false)}
            className="hairline-subtle p-6 hover:border-[var(--border-hover)] text-text-secondary"
            aria-label="Close menu"
          >
            <X size={12} strokeWidth={1.5} />
          </button>
        </header>

        <nav className="flex-1 flex flex-col gap-20 px-10 py-16 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-10 mb-6">
                <span className="label-text">{group.label}</span>
              </div>
              <ul className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href ||
                        pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
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
                })}
              </ul>
            </div>
          ))}
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
