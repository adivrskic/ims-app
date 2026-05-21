import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProviderLogo } from "@/components/integrations/ProviderLogo";
import { getCurrentOrgContext } from "@/lib/data/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROVIDERS } from "../providers";
import { WebhooksClient } from "./WebhooksClient";

export const metadata = { title: "Webhooks · Integrations" };

export default async function WebhooksPage() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) redirect("/login");

  const info = PROVIDERS.find((p) => p.key === "webhooks")!;

  const admin = createAdminClient();
  const { data: endpoints } = await admin
    .from("webhook_endpoints")
    .select(
      "id, name, events_enabled, status, last_delivered_at, last_error, total_deliveries, total_failures, created_at"
    )
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-32">
      <Link
        href="/integrations"
        className="mono-sm text-text-muted hover:text-text inline-flex items-center gap-6 self-start"
      >
        <ArrowLeft size={12} strokeWidth={1.5} /> All integrations
      </Link>

      <div className="flex items-start gap-16">
        <ProviderLogo provider={info} size={56} />
        <PageHeader
          eyebrow={info.category}
          title="Webhooks"
          description="Subscribe HTTP endpoints to Nautilus events. Each endpoint gets a unique signing secret; receivers verify the X-Nautilus-Signature header to confirm payloads are genuine."
        />
      </div>

      <WebhooksClient endpoints={endpoints ?? []} />
    </div>
  );
}
