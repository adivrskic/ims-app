import { getCurrentFacility } from "@/lib/currentFacility";
import { createClient } from "@/lib/supabase/server";

/**
 * The resolved active facility scope for the current request.
 *
 * - `mode: "all"` — show data from every facility in the workspace.
 *   `id` and `name` are null. Queries should not filter by warehouse_id.
 * - `mode: "single"` — show data from one specific facility.
 *   `id` is the facility UUID; `name` is its display name.
 */
export type FacilityScope =
  | { mode: "all"; id: null; name: null }
  | { mode: "single"; id: string; name: string };

/**
 * Resolves the active scope, including the facility's display name when
 * a specific one is selected. Call once at the top of any page that
 * shows facility-scoped data.
 *
 * If the cookie/profile resolves to a facility UUID but that facility
 * has been deleted between cookie-set and now, we fall back to "all"
 * rather than throwing — degrades gracefully.
 */
export async function getActiveScope(): Promise<FacilityScope> {
  const facility = await getCurrentFacility();
  if (!facility || facility === "all") {
    return { mode: "all", id: null, name: null };
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("warehouses")
    .select("id, name")
    .eq("id", facility)
    .maybeSingle();

  if (!data) return { mode: "all", id: null, name: null };
  return { mode: "single", id: data.id, name: data.name };
}

/**
 * Helper for page descriptions that need to mention the active scope.
 *
 * scopeDescription(scope, {
 *   all: "Across every facility — orders, pickups, transfers.",
 *   single: (name) => `Orders, pickups, and transfers at ${name}.`,
 * })
 *
 * Keeps the conditional out of every page's JSX.
 */
export function scopeDescription(
  scope: FacilityScope,
  variants: {
    all: string;
    single: (facilityName: string) => string;
  }
): string {
  if (scope.mode === "single") return variants.single(scope.name);
  return variants.all;
}
