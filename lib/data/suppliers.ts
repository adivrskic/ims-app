import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { tags } from "@/lib/cache-tags";
import type { Supplier } from "@/app/(app)/suppliers/types";

/**
 * Cross-request cached fetcher for the Suppliers directory page.
 *
 * Returns the three RAW datasets the page needs; the page keeps doing its
 * own grouping + computeSupplierStats math unchanged. This mirrors the old
 * Promise.all (listSuppliers + POs + product counts), just cached.
 *
 * Admin (service-role) client → BYPASSES RLS, so every query filters org_id
 * explicitly; the cache key includes org_id.
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
}

export function getSuppliersPageData(
  orgId: string
): Promise<SuppliersPageData> {
  return unstable_cache(
    async (): Promise<SuppliersPageData> => {
      const admin = createAdminClient();

      const [
        { data: suppliers },
        { data: pos },
        { data: productCounts },
      ] = await Promise.all([
        // Mirrors listSuppliers({ includeInactive: true }) — no is_active filter.
        admin
          .from("suppliers")
          .select("*")
          .eq("org_id", orgId)
          .order("name"),
        admin
          .from("purchase_orders")
          .select(
            `id, supplier_id, status, expected_date, sent_at, received_at,
             lines:po_line_items ( quantity_expected, quantity_received, unit_cost, landed_unit_cost )`
          )
          .eq("org_id", orgId)
          .not("supplier_id", "is", null),
        admin
          .from("products")
          .select("preferred_supplier_id")
          .eq("org_id", orgId),
      ]);

      return {
        suppliers: (suppliers ?? []) as Supplier[],
        pos: (pos ?? []) as SupplierScorecardPoRow[],
        productCounts: (productCounts ?? []) as Array<{
          preferred_supplier_id: string | null;
        }>,
      };
    },
    ["suppliers-page", orgId],
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