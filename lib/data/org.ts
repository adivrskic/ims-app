import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";

/**
 * Cross-request cached fetchers for slow-changing org data.
 *
 * IMPORTANT: these use the admin (service-role) client, which BYPASSES
 * RLS. Every query MUST filter by org_id explicitly — that's the only
 * thing keeping orgs from seeing each other's data. The cache key also
 * includes org_id so cached entries never cross workspaces.
 *
 * Each fetcher has a tag attached. Mutating actions (create/update/delete
 * for the corresponding table) MUST call revalidateTag(tags.X(orgId)) so
 * the next read sees fresh data. The 1-hour revalidate is a safety net,
 * not the primary invalidation strategy.
 */

export interface CategoryRow {
  id: string;
  name: string;
  sort_order: number | null;
}

export const getCategories = (orgId: string): Promise<CategoryRow[]> =>
  unstable_cache(
    async () => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("categories")
        .select("id, name, sort_order")
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true });
      return (data ?? []) as CategoryRow[];
    },
    ["categories", orgId],
    { tags: [tags.categories(orgId)], revalidate: 3600 }
  )();

export interface SupplierRow {
  id: string;
  name: string;
  default_lead_time_days: number | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  payment_terms: string | null;
}

export const getSuppliers = (orgId: string): Promise<SupplierRow[]> =>
  unstable_cache(
    async () => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("suppliers")
        .select(
          "id, name, default_lead_time_days, email, phone, address, payment_terms"
        )
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      return (data ?? []) as SupplierRow[];
    },
    ["suppliers", orgId],
    { tags: [tags.suppliers(orgId)], revalidate: 3600 }
  )();

export interface WarehouseRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  owner_id: string | null;
}

export const getActiveWarehouses = (orgId: string): Promise<WarehouseRow[]> =>
  unstable_cache(
    async () => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("warehouses")
        .select("id, name, address, city, state, zip, phone, owner_id")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      return (data ?? []) as WarehouseRow[];
    },
    ["warehouses", orgId],
    { tags: [tags.warehouses(orgId)], revalidate: 3600 }
  )();
