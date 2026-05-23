import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";
import type { Customer } from "@/app/(app)/customers/types";

/**
 * Cross-request cached fetcher for the Customers directory page.
 *
 * Mirrors listCustomers({ includeInactive: true }) — returns ALL customers
 * (active + inactive); the CustomerList component handles the active/search
 * filtering client-side.
 *
 * Admin (service-role) client → BYPASSES RLS, so the query filters org_id
 * explicitly; the cache key includes org_id. Tagged tags.customers(orgId);
 * customer create/update/activate bust it.
 */
export function getCustomersList(orgId: string): Promise<Customer[]> {
  return unstable_cache(
    async (): Promise<Customer[]> => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("customers")
        .select("*")
        .eq("org_id", orgId)
        .order("name");
      return (data ?? []) as Customer[];
    },
    ["customers-page", orgId],
    { tags: [tags.customers(orgId)], revalidate: 300 }
  )();
}