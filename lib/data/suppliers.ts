import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";
import { clampPageSize, ilikePattern } from "@/lib/listParams";
import type { Supplier } from "@/app/(app)/suppliers/types";

/**
 * Cross-request cached fetcher for the Suppliers directory page.
 *
 * Search / active-filter / pagination all happen in Postgres (URL-driven,
 * mirroring lib/data/inventory.ts): `q` matches name / contact / email /
 * phone via ilike, `includeInactive=false` keeps the old "Active only"
 * default, and the page window comes from .range() with count:"exact".
 *
 * The scorecard datasets (POs + preferred-product counts) are scoped to the
 * suppliers ON THE CURRENT PAGE — the page keeps doing its own grouping +
 * computeSupplierStats math unchanged, it just gets page-sized inputs
 * instead of the whole org's PO history.
 *
 * Admin (service-role) client → BYPASSES RLS, so every query filters org_id
 * explicitly; the cache key includes org_id (+ every filter and the page).
 *
 * Tagged tags.suppliers + tags.purchaseOrders + tags.products:
 *   - supplier create/update/activate busts suppliers
 *   - PO mutations bust purchaseOrders (scorecard chips update)
 *   - product preferred_supplier changes bust products (productCount updates)
 */

export interface SupplierScorecardPoRow {
  id: string;
  supplier_id: string | null;
  status:
    | "draft"
    | "sent"
    | "partially_received"
    | "fully_received"
    | "cancelled";
  expected_date: string | null;
  sent_at: string | null;
  received_at: string | null;
  lines: Array<{
    quantity_expected: number;
    quantity_received: number | null;
    unit_cost: string | null;
    landed_unit_cost: string | null;
  }> | null;
}

export interface SuppliersPageData {
  suppliers: Supplier[];
  pos: SupplierScorecardPoRow[];
  productCounts: Array<{ preferred_supplier_id: string | null }>;
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Filters {
  q?: string;
  /** true = show inactive suppliers too (the old toggle's "Showing inactive"). */
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}

export function getSuppliersPageData(
  orgId: string,
  { q, includeInactive = false, page = 1, pageSize }: Filters = {}
): Promise<SuppliersPageData> {
  const size = clampPageSize(pageSize);
  const requestedPage =
    Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const trimmedQ = q?.trim() || null;

  return unstable_cache(
    async (): Promise<SuppliersPageData> => {
      const admin = createAdminClient();

      const call = (offset: number) => {
        let query = admin
          .from("suppliers")
          .select("*", { count: "exact" })
          .eq("org_id", orgId);
        if (!includeInactive) query = query.eq("is_active", true);
        if (trimmedQ) {
          const pat = ilikePattern(trimmedQ);
          query = query.or(
            `name.ilike.${pat},contact_name.ilike.${pat},email.ilike.${pat},phone.ilike.${pat}`
          );
        }
        return query
          .order("name")
          .order("id") // stable tiebreak across pages
          .range(offset, offset + size - 1);
      };

      const { data, count, error } = await call((requestedPage - 1) * size);
      if (error) {
        console.error("suppliers list query failed:", error.message);
        return {
          suppliers: [],
          pos: [],
          productCounts: [],
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
      let suppliers = (data ?? []) as Supplier[];
      let servedPage = requestedPage;
      if (
        suppliers.length === 0 &&
        totalCount > 0 &&
        requestedPage > totalPages
      ) {
        servedPage = totalPages;
        const retry = await call((servedPage - 1) * size);
        suppliers = (retry.data ?? []) as Supplier[];
      }

      // Scorecard inputs, scoped to just the suppliers on this page.
      let pos: SupplierScorecardPoRow[] = [];
      let productCounts: Array<{ preferred_supplier_id: string | null }> = [];
      const supplierIds = suppliers.map((s) => s.id);
      if (supplierIds.length > 0) {
        const [{ data: poData }, { data: productData }] = await Promise.all([
          admin
            .from("purchase_orders")
            .select(
              `id, supplier_id, status, expected_date, sent_at, received_at,
               lines:po_line_items ( quantity_expected, quantity_received, unit_cost, landed_unit_cost )`
            )
            .eq("org_id", orgId)
            .in("supplier_id", supplierIds),
          admin
            .from("products")
            .select("preferred_supplier_id")
            .eq("org_id", orgId)
            .in("preferred_supplier_id", supplierIds),
        ]);
        pos = (poData ?? []) as SupplierScorecardPoRow[];
        productCounts = (productData ?? []) as Array<{
          preferred_supplier_id: string | null;
        }>;
      }

      return {
        suppliers,
        pos,
        productCounts,
        totalCount,
        page: servedPage,
        pageSize: size,
        totalPages,
      };
    },
    [
      "suppliers-page",
      orgId,
      trimmedQ || "none",
      includeInactive ? "all" : "active",
      String(requestedPage),
      String(size),
    ],
    {
      tags: [
        tags.suppliers(orgId),
        tags.purchaseOrders(orgId),
        tags.products(orgId),
      ],
      revalidate: 300,
    }
  )();
}
