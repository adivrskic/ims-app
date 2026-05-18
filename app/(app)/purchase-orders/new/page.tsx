import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { CreatePoForm } from "./CreatePoForm";
import { ArrowLeft } from "lucide-react";

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
        .select("id, name, contact_email, contact_phone, payment_terms")
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

  return (
    <div className="flex flex-col gap-32">
      <div className="flex flex-col gap-12">
        <Link
          href="/purchase-orders"
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors w-fit"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text">All purchase orders</span>
        </Link>

        <PageHeader
          eyebrow="Flow"
          title="New purchase order"
          description="Place an order with a supplier. Items will reconcile against on-hand inventory on receipt."
        />
      </div>

      <CreatePoForm
        products={products ?? []}
        warehouses={warehouses ?? []}
        suppliers={suppliers ?? []}
      />
    </div>
  );
}
