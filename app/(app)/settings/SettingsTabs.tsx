"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "Account" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/billing", label: "Billing" },
  { href: "/settings/api-keys", label: "API keys" },
  { href: "/settings/audit", label: "Audit log" },
  { href: "/settings/webhooks", label: "Webhooks" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav
      className="flex items-center gap-2 hairline-b overflow-x-auto"
      aria-label="Settings sections"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative px-12 py-10 label-text transition-colors whitespace-nowrap ${
              active
                ? "text-[var(--accent)]"
                : "text-text-muted hover:text-text"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
            {active && (
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
  );
}
