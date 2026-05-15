import { TopNav } from "@/components/nav/TopNav";
import { SideRail } from "@/components/nav/SideRail";
import { MobileNav } from "@/components/nav/MobileNav";
import { CommandPalette } from "@/components/nav/CommandPalette";
import { KeyboardShortcuts } from "@/components/nav/KeyboardShortcuts";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { WorkspaceOption } from "@/components/nav/WorkspaceSwitcher";
import type { NotificationItem } from "@/components/nav/NotificationsDropdown";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile },
    { data: memberships },
    { data: notifications },
    { count: unreadCount },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("org_members")
      .select("role, org:orgs ( id, name, slug )")
      .eq("user_id", user.id),
    supabase
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
  ]);

  const workspaces: WorkspaceOption[] = (memberships ?? []).map(
    (m: { role: string; org: unknown }) => {
      const org = Array.isArray(m.org) ? m.org[0] : m.org;
      const safe = org as { id: string; name: string; slug: string } | null;
      return {
        id: safe?.id ?? "",
        name: safe?.name ?? "Unknown",
        slug: safe?.slug ?? "",
        role: m.role,
      };
    }
  );

  const workspace = workspaces[0] ?? null;

  const userForNav = profile
    ? { email: profile.email, full_name: profile.full_name }
    : { email: user.email ?? "", full_name: null };

  return (
    <div className="min-h-screen flex flex-col">
      <CommandPalette />
      <KeyboardShortcuts />
      <MobileNav />
      <TopNav
        user={userForNav}
        workspace={workspace}
        workspaces={workspaces}
        notifications={(notifications ?? []) as NotificationItem[]}
        unreadCount={unreadCount ?? 0}
      />
      <div className="flex flex-1">
        <SideRail />
        <main className="flex-1 min-w-0 relative">
          <div
            className="absolute inset-0 dot-grid opacity-40 pointer-events-none"
            aria-hidden
          />
          <div className="relative max-w-[1480px] px-20 md:px-32 lg:px-40 py-24 md:py-40">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
