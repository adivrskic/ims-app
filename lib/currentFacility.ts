import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/user";

/**
 * Cookie name for the user's current facility selection.
 *
 * Value is either a facility UUID, the literal string "all", or absent
 * (which means "no explicit selection yet — resolve to a default").
 *
 * Set by the `setCurrentFacility` server action when the user picks
 * something in the sidebar's FacilitiesNavItem popover. Read everywhere
 * data is fetched.
 */
export const CURRENT_FACILITY_COOKIE = "Nautilus-current-facility";

/**
 * A selectable facility shown in the sidebar facility switcher.
 * Used by SideRail and FacilitiesNavItem.
 */
export interface FacilityOption {
  id: string;
  name: string;
}

/**
 * Combined facility navigation state for the app layout: the list of
 * facilities the user can switch between, plus the currently-resolved
 * facility id ("all" or a UUID resolves to a string; null means none).
 */
export interface FacilityNavState {
  facilities: FacilityOption[];
  currentId: string | null;
}

/**
 * Resolves the facility switcher state for the current request: the list of
 * active facilities plus the resolved current selection.
 *
 * The current selection reuses `getCurrentFacility()` (request-cached). The
 * facility list is a lightweight active-warehouses query.
 */
export const getCurrentFacilityState = cache(
  async (): Promise<FacilityNavState> => {
    const currentRaw = await getCurrentFacility();
    // "all" is a view mode, not a concrete facility id for the switcher.
    const currentId = currentRaw === "all" ? null : currentRaw;

    const supabase = await createClient();
    const { data } = await supabase
      .from("warehouses")
      .select("id, name")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    const facilities: FacilityOption[] = (data ?? []).map((w) => ({
      id: w.id,
      name: w.name,
    }));

    return { facilities, currentId };
  }
);

/**
 * Resolves the active facility for the current request.
 *
 * Order:
 *   1. Cookie value (if it's "all" or a real facility UUID owned by this org)
 *   2. profiles.default_warehouse_id for the signed-in user
 *   3. The first active facility in the workspace, ordered by created_at
 *   4. null — workspace has no facilities at all
 *
 * Returns a facility UUID, the literal "all", or null. Callers that want
 * the resolved name + a typed scope object should use `getActiveScope`
 * from lib/facilityScope.ts instead — it wraps this and adds the name lookup.
 *
 * Wrapped in React `cache()`: the layout, the page, and `getActiveScope`
 * all resolve the facility within a single request, so this used to fire
 * its auth + warehouse/profile lookups multiple times per navigation. It
 * now runs at most once per request, and reuses `getCurrentUser()` (also
 * request-cached) instead of issuing its own `auth.getUser()`.
 */
export const getCurrentFacility = cache(
  async (): Promise<string | "all" | null> => {
    const user = await getCurrentUser();
    if (!user) return null;

    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(CURRENT_FACILITY_COOKIE)?.value;

    const supabase = await createClient();

    // Cookie says "all" — explicit user choice, honor it
    if (cookieValue === "all") return "all";

    // Cookie says a specific facility — verify it still exists + is active
    if (cookieValue) {
      const { data: w } = await supabase
        .from("warehouses")
        .select("id, is_active")
        .eq("id", cookieValue)
        .maybeSingle();
      if (w && w.is_active !== false) return w.id;
      // fall through if facility was deleted or archived
    }

    // No valid cookie — fall back to profile default
    const { data: profile } = await supabase
      .from("profiles")
      .select("default_warehouse_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.default_warehouse_id) {
      const { data: w } = await supabase
        .from("warehouses")
        .select("id, is_active")
        .eq("id", profile.default_warehouse_id)
        .maybeSingle();
      if (w && w.is_active !== false) return w.id;
    }

    // No profile default — first active facility
    const { data: first } = await supabase
      .from("warehouses")
      .select("id")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    return first?.id ?? null;
  }
);