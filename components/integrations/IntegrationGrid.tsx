"use client";

import { AlertTriangle, Check, Plug } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { CornerButton } from "@/components/ui/CornerButton";
import { useGlowCards } from "@/lib/useGlowCards";
import { ProviderLogo } from "@/components/integrations/ProviderLogo";
import type { ProviderInfo } from "./providers";

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

              <footer className="flex items-center justify-end mt-auto pt-4">
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
            </div>
          </article>
        );
      })}
    </div>
  );
}
