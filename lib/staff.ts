import { createClient } from "@/lib/supabase/server";

export interface StaffUser {
  id: string;
  email: string;
  full_name: string;
}

/**
 * Returns the current user if they're flagged as staff, or null.
 *
 * Used by `app/(admin)/layout.tsx` to gate the entire admin route group.
 * Pages call this and redirect to "/" (or 404) when null.
 *
 * The staff flag (`profiles.is_staff`) is set manually for the first
 * Nautilus employee via SQL, then propagated through the admin dashboard's
 * staff management UI (not built yet — just a checkbox on the staff
 * settings page when you add it).
 */
export async function getStaffUser(): Promise<StaffUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Read the staff flag from the user's profile. The profile RLS policy
  // already lets users read their own profile, so no admin client needed
  // for this check — just the signed-in user reading their own row.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, is_staff")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_staff) return null;

  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
  };
}
