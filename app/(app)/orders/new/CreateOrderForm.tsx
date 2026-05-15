import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { CreateOrderForm } from "./CreateOrderForm";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "New order" };

export default async function NewOrderPage() {
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
      <div className="flex flex-col gap-12">
        <Link
          href="/orders"
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors w-fit"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text">All orders</span>
        </Link>

        <PageHeader
          eyebrow="Flow"
          title="New order"
          description="Create a pick list for an installer, customer pickup, transfer, or restock."
        />
      </div>

      <CreateOrderForm
        products={products ?? []}
        warehouses={warehouses ?? []}
      />
    </div>
  );
}
