import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { CreateOrderForm } from "./CreateOrderForm";

export const metadata = { title: "New order" };

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const supabase = await createClient();

  const [{ data: products }, { data: warehouses }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, barcode")
      .order("name", { ascending: true }),
    supabase
      .from("warehouses")
      .select("id, name")
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
  ]);

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
        products={products ?? []}
        warehouses={warehouses ?? []}
        initialType={type}
      />
    </div>
  );
}
