import { redirect } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { getStaffUser } from "@/lib/staff";
import { signOut } from "@/app/(auth)/actions";
import { ArrowLeftRight, Building2, UserPlus, LogOut } from "lucide-react";

export const metadata = { title: "Staff · Nautilus" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getStaffUser();
  if (!staff) {
    // Not staff — silently bounce to overview. We don't 404 because that
    // would leak that /admin exists. Redirect to "/" so a curious customer
    // sees nothing unusual.
    redirect("/");
  }

  return (
    <main className="min-h-screen flex flex-col bg-[var(--bg)]">
      {/*
        Distinctive red marker bar across the top. Hard to confuse this
        view with the regular dashboard once you've seen it.
      */}
      <div
        aria-hidden
        style={{
          height: 3,
          background: "var(--danger)",
        }}
      />

      <header className="h-56 hairline-b flex items-center justify-between px-20 sticky top-0 z-40 bg-[var(--bg)]">
        <div className="flex items-center gap-16">
          <Link href="/admin" className="flex items-center gap-10 text-text">
            <Logo size={18} />
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                letterSpacing: "2.5px",
                fontWeight: 500,
              }}
            >
              NAUTILUS
            </span>
            <span
              className="hairline-subtle px-8 py-2 mono-sm"
              style={{
                color: "var(--danger)",
                borderColor: "var(--danger)",
                fontSize: 9,
                letterSpacing: "1.5px",
              }}
            >
              STAFF
            </span>
          </Link>

          <nav
            className="flex items-center gap-2"
            aria-label="Staff navigation"
          >
            <Link
              href="/admin"
              className="px-12 py-6 label-text text-text-muted hover:text-text transition-colors"
            >
              Workspaces
            </Link>
            <Link
              href="/admin/onboard"
              className="px-12 py-6 label-text text-text-muted hover:text-text transition-colors"
            >
              Onboard
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-14">
          <Link
            href="/"
            className="hairline-subtle px-10 py-6 inline-flex items-center gap-6 mono-sm text-text-muted hover:text-text transition-colors"
            title="Switch to your customer view"
          >
            <ArrowLeftRight size={11} strokeWidth={1.5} />
            Customer view
          </Link>
          <span className="label-text text-text-muted">
            {staff.full_name || staff.email}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="hairline-subtle p-6 hover:border-[var(--border-hover)] text-text-secondary"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={11} strokeWidth={1.5} />
            </button>
          </form>
        </div>
      </header>

      <div className="flex-1 px-20 lg:px-40 py-32 max-w-[1280px] w-full mx-auto">
        {children}
      </div>
    </main>
  );
}
