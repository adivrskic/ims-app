import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProviderLogo } from "@/components/integrations/ProviderLogo";
import { getCurrentOrgContext } from "@/lib/data/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROVIDERS } from "../providers";
import { SlackConfigForm } from "./SlackConfigForm";

interface PageProps {
  params: Promise<{ provider: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { provider } = await params;
  const info = PROVIDERS.find((p) => p.key === provider);
  return { title: `${info?.name ?? "Integration"} · Settings` };
}

export default async function ProviderConfigPage({ params }: PageProps) {
  const { provider } = await params;
  const info = PROVIDERS.find((p) => p.key === provider);
  if (!info) notFound();

  const ctx = await getCurrentOrgContext();
  if (!ctx) notFound();

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("integrations")
    .select(
      "id, status, config, events_enabled, last_synced_at, last_error, connected_at, external_account_id"
    )
    .eq("org_id", ctx.orgId)
    .eq("provider", provider)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-32">
      <div className="flex items-start gap-16">
        <ProviderLogo provider={info} size={56} />
        <PageHeader
          eyebrow={info.category}
          title={info.name}
          description={info.description}
          backHref="/integrations"
          backLabel="All integrations"
        />
      </div>

      {provider === "slack" ? (
        <SlackConfigForm
          existing={
            existing
              ? {
                  status: existing.status as
                    | "connected"
                    | "error"
                    | "disconnected",
                  config: (existing.config as { bot_name?: string }) ?? {},
                  events_enabled: existing.events_enabled ?? [],
                  last_synced_at: existing.last_synced_at,
                  last_error: existing.last_error,
                }
              : null
          }
        />
      ) : (
        <div className="hairline bg-[var(--surface)] p-32 flex flex-col gap-12">
          <p className="label-text text-text-muted">— Not yet available</p>
          <p
            className="mono-sm text-text-secondary"
            style={{ lineHeight: 1.6 }}
          >
            {info.name} is in the roadmap but isn&apos;t connectable yet. The
            integration shell, OAuth flow, and sync logic still need to be built
            — Slack is the reference implementation; expect{" "}
            {info.name === "Shopify" || info.name === "QuickBooks Online"
              ? "this one"
              : "more providers"}{" "}
            to come online next.
          </p>
        </div>
      )}
    </div>
  );
}
