"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpCircle } from "lucide-react";
import { NAV_GROUPS } from "@/lib/navData";

export function SideRail() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden md:flex w-[220px] shrink-0 hairline-r bg-[var(--bg)] py-16 sticky top-56 self-start h-[calc(100vh-56px)] flex-col"
      aria-label="Primary navigation"
    >
      <nav className="flex-1 flex flex-col gap-20 px-10 overflow-y-auto pb-16">
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
                const soon = item.status === "soon";
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`relative flex items-center gap-10 px-10 py-7 transition-all duration-200 ${
                        active
                          ? "bg-[var(--accent-dim)] text-[var(--accent)]"
                          : "text-text-secondary hover:text-text hover:bg-[var(--surface-2)]"
                      } ${soon ? "opacity-50" : ""}`}
                      aria-current={active ? "page" : undefined}
                    >
                      {active && (
                        <span
                          className="absolute left-0 top-0 bottom-0 w-px bg-[var(--accent)]"
                          aria-hidden
                        />
                      )}
                      <Icon size={13} strokeWidth={1.5} />
                      <span
                        className="flex-1"
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 11,
                          letterSpacing: "1.5px",
                          textTransform: "uppercase",
                        }}
                      >
                        {item.label}
                      </span>
                      {soon && (
                        <span
                          className="text-text-dim"
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 8,
                            letterSpacing: "1.2px",
                          }}
                        >
                          SOON
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="hairline-t mx-10 mb-8" />

      <div className="px-10 flex flex-col gap-2">
        <Link
          href="https://nimbuswms.com/help"
          target="_blank"
          rel="noopener"
          className="flex items-center gap-10 px-10 py-7 text-text-muted hover:text-text transition-colors"
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

        <div className="px-10 py-7 flex items-center justify-between">
          <span className="label-text text-text-dim">v1 · 2026.05</span>
          <span className="inline-flex items-center gap-5">
            <span className="dot dot-online" aria-hidden />
            <span className="label-text text-[var(--success)]">OK</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
