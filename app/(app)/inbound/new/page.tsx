import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewAsnForm } from "./NewAsnForm";

export const metadata = { title: "New ASN" };

export default async function NewAsnPage() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return <PageHeader eyebrow="Inbound" title="New ASN" description="No workspace." />;
  const supabase = await createClient();

  const [{ data: suppliers }, { data: warehouses }] = await Promise.all([
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
  ]);

  return (
    <div className="flex flex-col gap-24 max-w-[760px]">
      <Link href="/inbound" className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors w-fit">
        <ArrowLeft size={11} strokeWidth={1.5} />
        <span className="label-text">Inbound</span>
      </Link>
      <PageHeader
        eyebrow="Inbound · Create"
        title="New advance ship notice"
        description="Record what a supplier is sending. Group lines onto a pallet with an LPN to receive the whole pallet in one scan."
      />
      <NewAsnForm
        suppliers={(suppliers ?? []) as Array<{ id: string; name: string }>}
        warehouses={(warehouses ?? []) as Array<{ id: string; name: string }>}
      />
    </div>
  );
}
