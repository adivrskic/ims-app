import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";
import { clampPageSize, ilikePattern } from "@/lib/listParams";
import type { Customer } from "@/app/(app)/customers/types";

/**
 * Cross-request cached fetcher for the Customers directory page.
 *
 * Search / active-filter / pagination all happen in Postgres (URL-driven,
 * mirroring lib/data/inventory.ts): `q` matches name / company / email /
 * phone via ilike, `includeInactive=false` keeps the old "Active only"
 * default, and the page window comes from .range() with count:"exact" for
 * a real total.
 *
 * Admin (service-role) client → BYPASSES RLS, so the query filters org_id
 * explicitly; the cache key includes org_id (+ every filter and the page).
 * Tagged tags.customers(orgId); customer create/update/activate bust it.
 */

export interface CustomersListData {
  customers: Customer[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Filters {
  q?: string;
  /** true = show inactive customers too (the old toggle's "Showing inactive"). */
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}

export function getCustomersList(
  orgId: string,
  { q, includeInactive = false, page = 1, pageSize }: Filters = {}
): Promise<CustomersListData> {
  const size = clampPageSize(pageSize);
  const requestedPage =
    Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const trimmedQ = q?.trim() || null;

  return unstable_cache(
    async (): Promise<CustomersListData> => {
      const admin = createAdminClient();

      const call = (offset: number) => {
        let query = admin
          .from("customers")
          .select("*", { count: "exact" })
          .eq("org_id", orgId);
        if (!includeInactive) query = query.eq("is_active", true);
        if (trimmedQ) {
          const pat = ilikePattern(trimmedQ);
          query = query.or(
            `name.ilike.${pat},company_name.ilike.${pat},email.ilike.${pat},phone.ilike.${pat}`
          );
        }
        return query
          .order("name")
          .order("id") // stable tiebreak across pages
          .range(offset, offset + size - 1);
      };

      const { data, count, error } = await call((requestedPage - 1) * size);
      if (error) {
        console.error("customers list query failed:", error.message);
        return {
          customers: [],
          totalCount: 0,
          page: 1,
          pageSize: size,
          totalPages: 1,
        };
      }

      const totalCount = count ?? 0;
      const totalPages = Math.max(1, Math.ceil(totalCount / size));

      // If a stale ?page= overshot after filtering, re-fetch the last valid
      // page so the UI isn't blank.
      let rows = (data ?? []) as Customer[];
      let servedPage = requestedPage;
      if (rows.length === 0 && totalCount > 0 && requestedPage > totalPages) {
        servedPage = totalPages;
        const retry = await call((servedPage - 1) * size);
        rows = (retry.data ?? []) as Customer[];
      }

      return {
        customers: rows,
        totalCount,
        page: servedPage,
        pageSize: size,
        totalPages,
      };
    },
    [
      "customers-page",
      orgId,
      trimmedQ || "none",
      includeInactive ? "all" : "active",
      String(requestedPage),
      String(size),
    ],
    { tags: [tags.customers(orgId)], revalidate: 300 }
  )();
}
