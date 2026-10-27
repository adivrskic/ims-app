import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewAsnForm } from "./NewAsnForm";

export const metadata = { title: "New ASN" };

/**
 * PostgREST silently caps a select at 1,000 rows, so a workspace with more
 * products than that used to get a picker missing the tail of the catalogue
 * with no warning. The cap is now explicit and surfaced.
 * TODO: async search picker.
 */
const PICKER_CAP = 1000;

export default async function NewAsnPage() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return <PageHeader eyebrow="Inbound" title="New ASN" description="No workspace." />;
  const supabase = await createClient();

  const [{ data: suppliers }, { data: warehouses }, { data: products }] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("org_id", ctx.orgId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("warehouses")
        .select("id, name")
        .eq("org_id", ctx.orgId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("products")
        .select("id, name")
        .eq("org_id", ctx.orgId)
        .order("name")
        .limit(PICKER_CAP),
    ]);
  const productList = (products ?? []) as Array<{ id: string; name: string }>;

  return (
    <div className="flex flex-col gap-24 max-w-[760px]">
      <PageHeader
        eyebrow="Inbound · Create"
        title="New advance ship notice"
        description="Record what a supplier is sending. Group lines onto a pallet with an LPN to receive the whole pallet in one scan."
        backHref="/inbound"
        backLabel="Inbound"
      />
      <NewAsnForm
        suppliers={(suppliers ?? []) as Array<{ id: string; name: string }>}
        warehouses={(warehouses ?? []) as Array<{ id: string; name: string }>}
        products={productList}
      />
      {productList.length >= PICKER_CAP && (
        <p className="mono-sm text-text-muted" role="status">
          Showing the first {PICKER_CAP.toLocaleString()} products by name —
          search in Inventory to find the rest.
        </p>
      )}
    </div>
  );
}
