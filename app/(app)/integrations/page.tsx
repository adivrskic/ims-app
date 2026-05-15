import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Badge } from "@/components/ui/Badge";
import { CornerButton } from "@/components/ui/CornerButton";
import { AlertTriangle, Check, Plug } from "lucide-react";
import { PROVIDERS, type ProviderInfo } from "./providers";

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

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("integrations")
    .select(
      "id, provider, status, external_account_id, last_synced_at, last_error, connected_at"
    );
  const integrations = (data ?? []) as IntegrationRow[];
  const byProvider = new Map(integrations.map((i) => [i.provider, i]));

  // Filter providers: connected vs available
  const connectedProviders = PROVIDERS.filter((p) => byProvider.has(p.key));
  const availableProviders = PROVIDERS.filter((p) => !byProvider.has(p.key));

  // Group available by category for clarity
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
        description="Connect Nimbus to your storefront, accounting, shipping, and notification stack. Every connection is OAuth — credentials never touch our servers."
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-12">
            {connectedProviders.map((provider) => {
              const integration = byProvider.get(provider.key)!;
              return (
                <ProviderCard
                  key={provider.key}
                  provider={provider}
                  integration={integration}
                />
              );
            })}
          </div>
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
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-12">
                  {items.map((provider) => (
                    <ProviderCard key={provider.key} provider={provider} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ProviderCard({
  provider,
  integration,
}: {
  provider: ProviderInfo;
  integration?: IntegrationRow;
}) {
  const connected = !!integration;
  const hasError = integration?.status === "error";

  return (
    <article
      className={`hairline ${
        connected ? "bg-[var(--surface)]" : "bg-[var(--surface)]"
      } p-16 flex flex-col gap-12 transition-colors hover:border-[var(--border-hover)]`}
    >
      <header className="flex items-start justify-between gap-12">
        <div className="flex items-center gap-12 min-w-0">
          <span
            className="hairline-subtle shrink-0 flex items-center justify-center"
            style={{
              width: 36,
              height: 36,
              background: provider.brandColor,
              color: "#fff",
              fontFamily: "var(--mono)",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "-0.5px",
            }}
            aria-hidden
          >
            {provider.initials}
          </span>
          <div className="min-w-0">
            <p
              className="text-text truncate"
              style={{
                fontFamily: "var(--display)",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {provider.name}
            </p>
            <p className="label-text text-text-muted">{provider.category}</p>
          </div>
        </div>
        {hasError ? (
          <Badge tone="danger" variant="filled">
            <AlertTriangle size={9} strokeWidth={1.5} />
            Error
          </Badge>
        ) : connected ? (
          <Badge tone="success" variant="filled">
            <Check size={9} strokeWidth={1.5} />
            Connected
          </Badge>
        ) : null}
      </header>

      <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
        {provider.description}
      </p>

      {connected && integration && (
        <div className="hairline-subtle bg-[var(--surface-2)] px-12 py-10 flex flex-col gap-6">
          {integration.external_account_id && (
            <div className="flex items-center justify-between gap-12">
              <span className="label-text text-text-dim">Account</span>
              <code
                className="mono-sm text-text-secondary truncate"
                style={{ fontSize: 11 }}
              >
                {integration.external_account_id}
              </code>
            </div>
          )}
          <div className="flex items-center justify-between gap-12">
            <span className="label-text text-text-dim">Last sync</span>
            <span
              className="mono-sm text-text-secondary"
              style={{ fontSize: 11 }}
            >
              {relTime(integration.last_synced_at)}
            </span>
          </div>
          {integration.last_error && (
            <p
              className="mono-sm text-[var(--danger)] mt-4"
              style={{ fontSize: 10, lineHeight: 1.55 }}
            >
              {integration.last_error}
            </p>
          )}
        </div>
      )}

      <footer className="flex items-center justify-end mt-2">
        {connected ? (
          hasError ? (
            <CornerButton variant="primary" size="sm" disabled>
              Reconnect
            </CornerButton>
          ) : (
            <CornerButton variant="ghost" size="sm" disabled>
              Configure
            </CornerButton>
          )
        ) : (
          <CornerButton variant="primary" size="sm" disabled>
            <Plug size={11} strokeWidth={1.5} />
            Connect
          </CornerButton>
        )}
      </footer>
    </article>
  );
}
