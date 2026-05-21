import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { PROVIDERS, type ProviderInfo } from "./providers";
import { IntegrationGrid } from "@/components/integrations/IntegrationGrid";

export const metadata = { title: "Integrations" };

interface IntegrationRow {
  id: string;
  provider: string;
  status: string;
  external_account_id: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  connected_at: string | null;
}

export default async function IntegrationsPage() {
  const supabase = await createClient();

  const [integrationsResult, webhookCountResult] = await Promise.all([
    supabase
      .from("integrations")
      .select(
        "id, provider, status, external_account_id, last_synced_at, last_error, connected_at"
      ),
    supabase
      .from("webhook_endpoints")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
  ]);

  const integrations =
    (integrationsResult.data as IntegrationRow[] | null) ?? [];
  const byProvider = new Map(integrations.map((i) => [i.provider, i]));

  // Synthesize a "webhooks" integration row from the endpoint count so
  // the grid renders the card with a Connected badge when appropriate.
  const webhookCount = webhookCountResult.count ?? 0;
  if (webhookCount > 0) {
    byProvider.set("webhooks", {
      id: "webhooks-synthetic",
      provider: "webhooks",
      status: "connected",
      external_account_id: `${webhookCount} active endpoint${
        webhookCount === 1 ? "" : "s"
      }`,
      last_synced_at: null,
      last_error: null,
      connected_at: null,
    });
  }

  const connectedProviders = PROVIDERS.filter((p) => byProvider.has(p.key));
  const availableProviders = PROVIDERS.filter((p) => !byProvider.has(p.key));

  const grouped = new Map<string, ProviderInfo[]>();
  for (const p of availableProviders) {
    if (!grouped.has(p.category)) grouped.set(p.category, []);
    grouped.get(p.category)!.push(p);
  }
  const CATEGORY_ORDER: ProviderInfo["category"][] = [
    "Commerce",
    "Accounting",
    "Payments",
    "Shipping",
    "Notifications",
    "Automation",
    "CRM",
  ];

  return (
    <div className="flex flex-col gap-40">
      <PageHeader
        eyebrow="Configure"
        title="Integrations"
        description="Connect Nautilus to your storefront, accounting, shipping, and notification stack. Every connection is OAuth — credentials never touch our servers."
        meta={[
          {
            label: "Connected",
            value: integrations.filter((i) => i.status === "connected").length,
            status: "live" as const,
          },
          { label: "Available", value: PROVIDERS.length },
        ]}
      />

      {connectedProviders.length > 0 && (
        <section aria-labelledby="connected">
          <SectionTitle
            eyebrow="Live"
            title="Connected"
            action={
              <span className="label-text text-text-muted">
                {connectedProviders.length} active
              </span>
            }
          />
          <IntegrationGrid
            providers={connectedProviders}
            byProvider={byProvider}
          />
        </section>
      )}

      <section aria-labelledby="available">
        <SectionTitle eyebrow="Catalog" title="Available" />
        <div className="flex flex-col gap-32">
          {CATEGORY_ORDER.map((category) => {
            const items = grouped.get(category);
            if (!items || items.length === 0) return null;
            return (
              <div key={category} className="flex flex-col gap-12">
                <h3 className="label-text text-text-muted">{category}</h3>
                <IntegrationGrid providers={items} byProvider={byProvider} />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
