import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { CreatePoForm } from "./CreatePoForm";

export const metadata = { title: "New purchase order" };

export default async function NewPoPage() {
  const supabase = await createClient();

  const [{ data: products }, { data: warehouses }, { data: suppliers }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, barcode")
        .order("name", { ascending: true }),
      supabase
        .from("warehouses")
        .select("id, name")
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      supabase
        .from("suppliers")
        .select("id, name, email, phone, payment_terms")
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

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
        products={products ?? []}
        warehouses={warehouses ?? []}
        suppliers={suppliers ?? []}
      />
    </div>
  );
}
