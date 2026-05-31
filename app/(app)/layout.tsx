import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SideRail } from "@/components/nav/SideRail";
import { MobileNav } from "@/components/nav/MobileNav";
import { MobileTopBar } from "@/components/nav/MobileTopBar";
import { CommandPalette } from "@/components/nav/CommandPalette";
import { KeyboardShortcuts } from "@/components/nav/KeyboardShortcuts";
import { createClient } from "@/lib/supabase/server";
import { getCurrentFacilityState } from "@/lib/currentFacility";
import {
  getCurrentUser,
  getProfile,
  getMemberships,
  getActiveMembership,
} from "@/lib/data/user";
import type { WorkspaceOption } from "@/components/nav/WorkspaceSwitcher";
import type { NotificationItem } from "@/components/nav/NotificationsDropdown";
import { ScannerProvider } from "@/components/scanner/ScannerProvider";
import { PrinterProvider } from "@/components/print/PrinterProvider";
import { Suspense } from "react";
import { KioskGate } from "@/components/kiosk/KioskGate";

const SIDEBAR_COOKIE = "nimbus-sidebar-collapsed";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth + profile + memberships all go through React cache() so any page
  // or action that calls these within the same request reuses our results.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const initialCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "true";

  // These are now request-cached and free to other callers downstream.
  // Run in parallel with the still-uncached fetches below.
  const supabase = await createClient();
  const [
    profile,
    memberships,
    activeMembership,
    notifResult,
    unreadResult,
    facilityState,
  ] = await Promise.all([
    getProfile(),
    getMemberships(),
    getActiveMembership(),
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
    getCurrentFacilityState(),
  ]);

  // Onboarding guard — also covers the activeMembership null case.
  if (!memberships || memberships.length === 0 || !activeMembership) {
    redirect("/onboarding");
  }

  const workspaces: WorkspaceOption[] = memberships.map((m) => ({
    id: m.org?.id ?? "",
    name: m.org?.name ?? "Unknown",
    slug: m.org?.slug ?? "",
    role: m.role,
  }));

  // The active workspace comes from getActiveMembership (cookie-respecting),
  // not the first item in the list — fixing the multi-org silent bug.
  const workspace: WorkspaceOption = {
    id: activeMembership.org?.id ?? activeMembership.org_id,
    name: activeMembership.org?.name ?? "Unknown",
    slug: activeMembership.org?.slug ?? "",
    role: activeMembership.role,
  };

  const userForNav = profile
    ? { email: profile.email, full_name: profile.full_name }
    : { email: user.email ?? "", full_name: null };

  const notificationItems =
    (notifResult.data as NotificationItem[] | null) ?? [];
  const unread = unreadResult.count ?? 0;

  return (
    <ScannerProvider>
      <PrinterProvider>
        <div className="md:flex md:min-h-screen">
          <CommandPalette />
          <Suspense fallback={null}>
            <KioskGate />
          </Suspense>
          <KeyboardShortcuts />
          <MobileNav />

          <SideRail
            user={userForNav}
            workspace={workspace}
            workspaces={workspaces}
            notifications={notificationItems}
            unreadCount={unread}
            initialCollapsed={initialCollapsed}
            facilities={facilityState.facilities}
            currentFacilityId={facilityState.currentId}
          />

          <div className="flex-1 min-w-0 flex flex-col min-h-screen">
            <MobileTopBar unreadCount={unread} />

            <main className="flex-1 relative flex flex-col">
              <div
                className="absolute inset-0 dot-grid opacity-40 pointer-events-none"
                aria-hidden
              />
              <div className="relative max-w-[1760px] w-full px-20 md:px-32 lg:px-40 py-24 md:py-40 min-h-full flex flex-col">
                {children}
              </div>
            </main>
          </div>
        </div>
      </PrinterProvider>
    </ScannerProvider>
  );
}
