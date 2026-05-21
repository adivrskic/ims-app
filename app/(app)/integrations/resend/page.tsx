import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProviderLogo } from "@/components/integrations/ProviderLogo";
import { getCurrentOrgContext } from "@/lib/data/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROVIDERS } from "../providers";
import { ResendConfigForm } from "./ResendConfigForm";

export const metadata = { title: "Resend · Integrations" };

export default async function ResendPage() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) redirect("/login");

  const info = PROVIDERS.find((p) => p.key === "resend")!;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("integrations")
    .select(
      "id, status, config, events_enabled, last_synced_at, last_error, connected_at"
    )
    .eq("org_id", ctx.orgId)
    .eq("provider", "resend")
    .maybeSingle();

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
          title="Resend"
          description="Transactional email — invite delivery, event digests, branded customer comms. You'll need a verified sending domain in Resend before connecting."
        />
      </div>

      <ResendConfigForm
        existing={
          existing
            ? {
                status: existing.status as
                  | "connected"
                  | "error"
                  | "disconnected",
                config: existing.config as {
                  from_address?: string;
                  reply_to?: string;
                },
                events_enabled: existing.events_enabled ?? [],
                last_synced_at: existing.last_synced_at,
                last_error: existing.last_error,
              }
            : null
        }
      />
    </div>
  );
}
