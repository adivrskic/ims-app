"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
  /**
   * If true, only highlight when pathname matches exactly. The root
   * /settings tab needs this — otherwise it'd highlight on every nested
   * settings page since they all start with "/settings".
   */
  exact?: boolean;
}

const TABS: Tab[] = [
  { href: "/settings", label: "Account", exact: true },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/devices", label: "Devices" },
  { href: "/settings/billing", label: "Billing" },
  { href: "/settings/api-keys", label: "API keys" },
  { href: "/settings/audit", label: "Audit log" },
  { href: "/settings/webhooks", label: "Webhooks" },
];

/**
 * Check whether a tab is active for the current pathname.
 *
 * - exact=true: must equal exactly (e.g. /settings)
 * - exact=false: matches the href itself OR any nested path beneath it
 *   (so /settings/members/some-user-id still highlights "Members")
 *
 * The `+ "/"` is critical — without it, "/settings/me" would falsely
 * activate "/settings/members" because the latter is a startsWith prefix.
 */
function isActive(pathname: string, tab: Tab): boolean {
  if (tab.exact) return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(tab.href + "/");
}

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav
      className="flex items-center gap-2 hairline-b overflow-x-auto"
      aria-label="Settings sections"
    >
      {TABS.map((tab) => {
        const active = isActive(pathname, tab);
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
                className="absolute left-0 right-0 h-px bg-[var(--accent)]"
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
