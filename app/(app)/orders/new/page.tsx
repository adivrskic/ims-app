import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { PageHeader } from "@/components/ui/PageHeader";
import { CreateOrderForm } from "./CreateOrderForm";

export const metadata = { title: "New order" };

/**
 * PostgREST silently caps a select at 1,000 rows, so a workspace with more
 * products than that used to get a picker missing the tail of the catalogue
 * with no warning. The cap is now explicit and surfaced.
 * TODO: async search picker.
 */
const PICKER_CAP = 1000;

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; product?: string }>;
}) {
  const { type, product } = await searchParams;
  const [ctx, supabase] = await Promise.all([
    getCurrentOrgContext(),
    createClient(),
  ]);
  if (!ctx) {
    return (
      <PageHeader eyebrow="Flow" title="New order" description="No workspace." />
    );
  }

  const [{ data: productRows }, { data: warehouses }] = await Promise.all([
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
  ]);
  const products = productRows ?? [];

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Flow"
        title="New order"
        description="Create a pick list for an installer, customer pickup, transfer, or restock."
        backHref="/orders"
        backLabel="All orders"
      />

      <CreateOrderForm
        products={products}
        warehouses={warehouses ?? []}
        initialType={type}
        initialProductId={product}
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
