"use client";

import { AlertTriangle, Check, Plug } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { CornerButton, CornerLink } from "@/components/ui/CornerButton";
import { useGlowCards } from "@/lib/useGlowCards";
import { LocalTime } from "@/components/ui/LocalTime";
import { ProviderLogo } from "@/components/integrations/ProviderLogo";
import type { ProviderInfo } from "@/app/(app)/integrations/providers";

interface IntegrationRow {
  id: string;
  provider: string;
  status: string;
  external_account_id: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  connected_at: string | null;
}

interface Props {
  providers: ProviderInfo[];
  byProvider: Map<string, IntegrationRow>;
  /** "connected" grid is denser by default (3-up); "available" same. */
  columns?: 2 | 3;
}

export function IntegrationGrid({ providers, byProvider, columns = 3 }: Props) {
  const ref = useGlowCards<HTMLDivElement>();
  const cols =
    columns === 2 ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3";

  return (
    <div ref={ref} className={`glow-cards grid grid-cols-1 ${cols} gap-12`}>
      {providers.map((provider) => {
        const integration = byProvider.get(provider.key);
        const connected = !!integration;
        const hasError = integration?.status === "error";

        return (
          <article key={provider.key} className="glow-card">
            <div className="glow-card-border" />
            <div className="glow-card-content hairline p-16 flex flex-col gap-12 min-h-[180px]">
              <header className="flex items-start justify-between gap-12">
                <div className="flex items-center gap-12 min-w-0">
                  <ProviderLogo provider={provider} size={44} />
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
                    <p className="label-text text-text-muted">
                      {provider.category}
                    </p>
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

              <p
                className="mono-sm text-text-muted flex-1"
                style={{ lineHeight: 1.6 }}
              >
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
                    {/* Hydration-safe: the old Date.now()/toLocaleDateString
                        pair rendered differently on the server and client. */}
                    <LocalTime
                      iso={integration.last_synced_at}
                      format="relative"
                      fallback="never"
                      className="mono-sm text-text-secondary"
                    />
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

              <footer className="flex items-center justify-end mt-auto pt-4">
                {connected ? (
                  hasError ? (
                    <CornerLink
                      href={
                        provider.key === "webhooks"
                          ? "/integrations/webhooks"
                          : `/integrations/${provider.key}`
                      }
                      variant="primary"
                      size="sm"
                    >
                      Reconnect
                    </CornerLink>
                  ) : (
                    <CornerLink
                      href={
                        provider.key === "webhooks"
                          ? "/integrations/webhooks"
                          : `/integrations/${provider.key}`
                      }
                      variant="ghost"
                      size="sm"
                    >
                      Configure
                    </CornerLink>
                  )
                ) : provider.key === "slack" ||
                  provider.key === "webhooks" ||
                  provider.key === "resend" ||
                  provider.key === "shopify" ? (
                  <CornerLink
                    href={
                      provider.key === "webhooks"
                        ? "/integrations/webhooks"
                        : `/integrations/${provider.key}`
                    }
                    variant="primary"
                    size="sm"
                  >
                    <Plug size={11} strokeWidth={1.5} />
                    Connect
                  </CornerLink>
                ) : (
                  <CornerButton variant="primary" size="sm" disabled>
                    <Plug size={11} strokeWidth={1.5} />
                    Coming soon
                  </CornerButton>
                )}
              </footer>
            </div>
          </article>
        );
      })}
    </div>
  );
}
