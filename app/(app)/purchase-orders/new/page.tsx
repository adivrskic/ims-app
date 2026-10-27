import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { PageHeader } from "@/components/ui/PageHeader";
import { CreatePoForm } from "./CreatePoForm";

export const metadata = { title: "New purchase order" };

/**
 * PostgREST silently caps a select at 1,000 rows, so a workspace with more
 * products than that used to get a picker missing the tail of the catalogue
 * with no warning. The cap is now explicit and surfaced.
 * TODO: async search picker.
 */
const PICKER_CAP = 1000;

export default async function NewPoPage() {
  const [ctx, supabase] = await Promise.all([
    getCurrentOrgContext(),
    createClient(),
  ]);
  if (!ctx) {
    return (
      <PageHeader
        eyebrow="Flow"
        title="New purchase order"
        description="No workspace."
      />
    );
  }

  const [{ data: productRows }, { data: warehouses }, { data: suppliers }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, barcode")
        .eq("org_id", ctx.orgId)
        .order("name", { ascending: true })
        .limit(PICKER_CAP),
      supabase
        .from("warehouses")
        .select("id, name")
        .eq("org_id", ctx.orgId)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      supabase
        .from("suppliers")
        .select("id, name, email, phone, payment_terms")
        .eq("org_id", ctx.orgId)
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(PICKER_CAP),
    ]);
  const products = productRows ?? [];

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Flow"
        title="New purchase order"
        description="Place an order with a supplier. Items will reconcile against on-hand inventory on receipt."
        backHref="/purchase-orders"
        backLabel="All purchase orders"
      />

      <CreatePoForm
        products={products}
        warehouses={warehouses ?? []}
        suppliers={suppliers ?? []}
      />
      {products.length >= PICKER_CAP && (
        <p className="mono-sm text-text-muted" role="status">
          Showing the first {PICKER_CAP.toLocaleString()} products by name —
          search in Inventory to find the rest.
        </p>
      )}
    </div>
  );
}
