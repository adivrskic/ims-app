"use client";

import Link from "next/link";
import {
  Settings,
  Users,
  KeyRound,
  History,
  CreditCard,
  LogOut,
} from "lucide-react";
import { useDropdown } from "@/lib/useDropdown";
import { signOut } from "@/app/(auth)/actions";

interface Props {
  user: { email: string; full_name?: string | null };
}

const ITEMS: Array<{
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

export function UserMenu({ user }: Props) {
  const { open, setOpen, ref } = useDropdown<HTMLDivElement>();

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
        className="flex items-center gap-8 hairline-subtle px-8 py-5 hover:border-[var(--border-hover)] transition-colors"
        aria-label="Account menu"
        aria-expanded={open}
      >
        <span
          className="w-20 h-20 rounded-full bg-[var(--accent)] text-[var(--black)] flex items-center justify-center"
          aria-hidden
        >
          <span
            style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600 }}
          >
            {initials}
          </span>
        </span>
        <span className="label-text text-text-secondary hidden md:inline">
          {firstName}
        </span>
      </button>

      {open && (
        <div
          className="absolute top-full right-0 mt-8 w-[240px] hairline bg-[var(--surface)] flex flex-col"
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
            {ITEMS.map((item) => {
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
