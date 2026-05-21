"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Plug,
  RefreshCw,
  Unplug,
  Zap,
} from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import {
  startShopifyOauth,
  testShopify,
  disconnectShopify,
  updateDefaultFacility,
} from "./actions";
import type { ShopifyConfig } from "@/lib/integrations/shopify/types";

interface Props {
  integration: {
    status: "connected" | "error" | "disconnected";
    shop_domain: string;
    config: ShopifyConfig | null;
    last_synced_at: string | null;
    last_error: string | null;
    connected_at: string | null;
  } | null;
  facilities: Array<{ id: string; name: string }>;
  recentOrders: Array<{
    id: string;
    order_number: string | null;
    customer_name: string | null;
    total: number | null;
    currency: string | null;
    status: string;
    placed_at: string | null;
    external_synced_at: string | null;
  }>;
  recentLog: Array<{
    id: string;
    topic: string;
    received_at: string;
    processed_at: string | null;
    process_error: string | null;
  }>;
  ok?: string;
  err?: string;
}

const ERR_MESSAGES: Record<string, string> = {
  invalid_shop:
    "That doesn't look like a valid shop domain — try yourstore.myshopify.com",
  config_missing:
    "Shopify isn't set up server-side. SHOPIFY_API_KEY / SHOPIFY_API_SECRET / NEXT_PUBLIC_APP_URL missing.",
  hmac_invalid:
    "Shopify's callback signature didn't verify — possible tampering or wrong API secret.",
  state_expired: "Your authorization session timed out. Try again.",
  state_signature_mismatch:
    "State signature mismatch. Try connecting again from scratch.",
  shop_invalid: "Returned shop domain was malformed.",
  code_missing: "No authorization code returned by Shopify.",
  token_exchange_failed:
    "Shopify rejected the token exchange. Check your API key + secret.",
  save_failed: "Couldn't save the integration. Check server logs.",
};

export function ShopifyConfigClient({
  integration,
  facilities,
  recentOrders,
  recentLog,
  ok,
  err,
}: Props) {
  const [state, formAction, pending] = useActionState(
    startShopifyOauth,
    undefined
  );
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    shopName?: string;
    error?: string;
  } | null>(null);
  const [testPending, startTest] = useTransition();
  const [disconnectPending, startDisconnect] = useTransition();
  const [facilityPending, startFacility] = useTransition();
  const [facilityResult, setFacilityResult] = useState<{
    error?: string;
    success?: string;
  } | null>(null);

  const handleTest = () => {
    setTestResult(null);
    startTest(async () => {
      setTestResult(await testShopify());
    });
  };

  const handleDisconnect = () => {
    if (
      !confirm(
        "Disconnect Shopify? Future orders won't sync until you reconnect."
      )
    ) {
      return;
    }
    startDisconnect(async () => {
      await disconnectShopify();
    });
  };

  const handleFacilityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const facilityId = e.target.value;
    setFacilityResult(null);
    startFacility(async () => {
      setFacilityResult(await updateDefaultFacility(facilityId));
    });
  };

  // Not connected — show the connect form
  if (!integration) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-24">
        <form
          action={formAction}
          className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16"
        >
          <header>
            <p className="label-text--lg">Connect your store</p>
            <p
              className="mono-sm text-text-muted mt-6"
              style={{ lineHeight: 1.6 }}
            >
              Enter your Shopify store domain. You&apos;ll be redirected to
              approve access, then sent back here.
            </p>
          </header>

          <Input
            label="Shop domain"
            name="shop"
            type="text"
            required
            placeholder="yourstore.myshopify.com"
            autoComplete="off"
          />

          {(err || state?.error) && (
            <p
              role="alert"
              className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-14 py-12 mono-sm text-[var(--danger)] inline-flex items-start gap-8"
            >
              <AlertTriangle
                size={11}
                strokeWidth={1.5}
                className="mt-2 shrink-0"
              />
              <span>{err ? ERR_MESSAGES[err] ?? err : state?.error}</span>
            </p>
          )}

          <footer>
            <CornerButton type="submit" variant="primary" loading={pending}>
              <Plug size={11} strokeWidth={1.5} />
              Authorize with Shopify
            </CornerButton>
          </footer>
        </form>

        <aside className="hairline-subtle p-16 flex flex-col gap-10">
          <p className="label-text text-text-muted">— What syncs</p>
          <ul
            className="mono-sm text-text-dim flex flex-col gap-6"
            style={{
              lineHeight: 1.6,
              fontSize: 10,
              listStyle: "disc",
              paddingLeft: 16,
            }}
          >
            <li>New orders → Nautilus orders (within seconds)</li>
            <li>Order updates and cancellations sync automatically</li>
            <li>
              Line items matched to your catalog by barcode or SKU; unknown SKUs
              auto-create stub products
            </li>
            <li>Read-only in v1 — no writes back to Shopify yet</li>
          </ul>
        </aside>
      </div>
    );
  }

  // Connected state
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-24">
      <div className="flex flex-col gap-24">
        {/* Connection card */}
        <section className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16">
          <header className="flex items-baseline justify-between gap-12">
            <p className="label-text--lg">01 · Connection</p>
            {integration.status === "connected" && (
              <Badge tone="success" variant="filled">
                <Check size={9} strokeWidth={1.5} /> Connected
              </Badge>
            )}
            {integration.status === "error" && (
              <Badge tone="danger" variant="filled">
                <AlertTriangle size={9} strokeWidth={1.5} /> Errored
              </Badge>
            )}
            {integration.status === "disconnected" && (
              <Badge tone="neutral" variant="filled">
                Disconnected
              </Badge>
            )}
          </header>

          <dl className="grid grid-cols-2 gap-x-24 gap-y-12 mono-sm">
            <div>
              <dt className="label-text text-text-dim mb-4">Shop</dt>
              <dd className="text-text-secondary">
                <a
                  href={`https://${integration.shop_domain}/admin`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-6 hover:text-text"
                >
                  {integration.shop_domain}
                  <ExternalLink size={9} strokeWidth={1.5} />
                </a>
              </dd>
            </div>
            <div>
              <dt className="label-text text-text-dim mb-4">Connected</dt>
              <dd className="text-text-secondary">
                {integration.connected_at
                  ? new Date(integration.connected_at).toLocaleDateString(
                      "en-US",
                      { dateStyle: "medium" }
                    )
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="label-text text-text-dim mb-4">Webhooks</dt>
              <dd className="text-text-secondary">
                {integration.config?.webhook_ids?.length ?? 0} registered
              </dd>
            </div>
            <div>
              <dt className="label-text text-text-dim mb-4">Scopes</dt>
              <dd
                className="text-text-secondary truncate"
                title={integration.config?.scopes?.join(", ")}
              >
                {integration.config?.scopes?.length ?? 0} granted
              </dd>
            </div>
          </dl>

          {integration.last_error && (
            <p
              className="hairline-subtle mono-sm px-12 py-10"
              style={{
                background: "var(--danger-dim)",
                color: "var(--danger)",
                fontSize: 10,
                lineHeight: 1.55,
              }}
            >
              <strong>Last error:</strong> {integration.last_error}
            </p>
          )}

          <footer className="flex items-center gap-10">
            <CornerButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleTest}
              loading={testPending}
            >
              <Zap size={11} strokeWidth={1.5} />
              Test connection
            </CornerButton>
            <CornerButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              loading={disconnectPending}
            >
              <Unplug size={11} strokeWidth={1.5} />
              Disconnect
            </CornerButton>
            {testResult && (
              <span
                className="mono-sm ml-auto"
                style={{
                  fontSize: 10,
                  color: testResult.ok ? "var(--success)" : "var(--danger)",
                }}
              >
                {testResult.ok
                  ? `✓ ${testResult.shopName}`
                  : `✗ ${testResult.error ?? "Failed"}`}
              </span>
            )}
          </footer>
        </section>

        {/* Default facility */}
        <section className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16">
          <header className="flex items-baseline justify-between gap-12">
            <p className="label-text--lg">02 · Default fulfillment facility</p>
            {facilityPending && (
              <RefreshCw
                size={11}
                strokeWidth={1.5}
                className="animate-spin text-text-dim"
              />
            )}
          </header>
          <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
            New Shopify orders route to this facility. Multi-location routing is
            on the v2 roadmap.
          </p>
          <Select
            name="default_facility"
            value={integration.config?.default_facility_id ?? ""}
            onChange={handleFacilityChange}
            disabled={facilityPending}
            options={facilities.map((f) => ({ value: f.id, label: f.name }))}
          />
          {facilityResult?.success && (
            <p
              className="mono-sm text-[var(--success)]"
              style={{ fontSize: 10 }}
            >
              ✓ {facilityResult.success}
            </p>
          )}
          {facilityResult?.error && (
            <p
              className="mono-sm text-[var(--danger)]"
              style={{ fontSize: 10 }}
            >
              ✗ {facilityResult.error}
            </p>
          )}
        </section>

        {/* Recent orders */}
        <section className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16">
          <header className="flex items-baseline justify-between gap-12">
            <p className="label-text--lg">03 · Recent synced orders</p>
            <Link
              href="/orders?source=shopify"
              className="mono-sm text-text-muted hover:text-text"
            >
              All orders →
            </Link>
          </header>
          {recentOrders.length === 0 ? (
            <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
              No orders synced yet. Place a test order on your store — it should
              appear here within a few seconds.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
              {recentOrders.map((o) => (
                <li
                  key={o.id}
                  className="py-10 flex items-center gap-16 first:pt-0"
                >
                  <Link
                    href={`/orders/${o.id}`}
                    className="mono-body text-text hover:text-[var(--accent)] transition-colors"
                    style={{ fontSize: 12, fontWeight: 500 }}
                  >
                    {o.order_number ?? "—"}
                  </Link>
                  <span className="mono-sm text-text-muted flex-1 truncate">
                    {o.customer_name ?? "—"}
                  </span>
                  <span className="mono-sm text-text-secondary tnum">
                    {o.total !== null
                      ? `${o.currency ?? ""} ${o.total.toFixed(2)}`
                      : "—"}
                  </span>
                  <Badge
                    tone={
                      o.status === "cancelled"
                        ? "danger"
                        : o.status === "fulfilled"
                        ? "success"
                        : "neutral"
                    }
                  >
                    {o.status}
                  </Badge>
                  <span
                    className="mono-sm text-text-dim shrink-0"
                    style={{ fontSize: 10 }}
                  >
                    {o.placed_at
                      ? new Date(o.placed_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Webhook log */}
        <section className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16">
          <header>
            <p className="label-text--lg">04 · Recent webhook deliveries</p>
            <p
              className="mono-sm text-text-muted mt-4"
              style={{ lineHeight: 1.6 }}
            >
              Last 15 events received from Shopify, ordered newest first.
            </p>
          </header>
          {recentLog.length === 0 ? (
            <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
              No webhook events received yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
              {recentLog.map((e) => (
                <li
                  key={e.id}
                  className="py-8 flex items-center gap-12 first:pt-0"
                >
                  <code
                    className="mono-body"
                    style={{
                      fontSize: 10,
                      color: "var(--text-secondary)",
                      minWidth: 140,
                    }}
                  >
                    {e.topic}
                  </code>
                  {e.process_error ? (
                    <Badge tone="danger">Failed</Badge>
                  ) : e.processed_at ? (
                    <Badge tone="success">Processed</Badge>
                  ) : (
                    <Badge tone="neutral">Pending</Badge>
                  )}
                  {e.process_error && (
                    <span
                      className="mono-sm flex-1 truncate"
                      style={{ fontSize: 10, color: "var(--danger)" }}
                      title={e.process_error}
                    >
                      {e.process_error}
                    </span>
                  )}
                  <span
                    className="mono-sm text-text-dim ml-auto shrink-0"
                    style={{ fontSize: 10 }}
                  >
                    {new Date(e.received_at).toLocaleString("en-US", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-16">
        {ok === "1" && (
          <div
            className="hairline-subtle px-14 py-12 mono-sm inline-flex items-start gap-8"
            style={{
              background: "var(--success-dim)",
              borderColor: "var(--success)",
              color: "var(--success)",
            }}
          >
            <Check size={11} strokeWidth={1.5} className="mt-2 shrink-0" />
            <span>Shopify connected. Webhooks registered.</span>
          </div>
        )}

        <div className="hairline-subtle p-16 flex flex-col gap-10">
          <p className="label-text text-text-muted">— Sync status</p>
          <dl className="flex flex-col gap-8 mono-sm">
            <div className="flex justify-between">
              <dt className="text-text-dim">Last sync</dt>
              <dd className="text-text-secondary" style={{ fontSize: 10 }}>
                {integration.last_synced_at
                  ? new Date(integration.last_synced_at).toLocaleString(
                      "en-US",
                      { dateStyle: "short", timeStyle: "short" }
                    )
                  : "Never"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="hairline-subtle p-16 flex flex-col gap-8">
          <p className="label-text text-text-muted">— Coming in v2</p>
          <ul
            className="mono-sm text-text-dim flex flex-col gap-6"
            style={{
              lineHeight: 1.6,
              fontSize: 10,
              listStyle: "disc",
              paddingLeft: 16,
            }}
          >
            <li>Inventory level write-back to Shopify</li>
            <li>Mark orders fulfilled with tracking</li>
            <li>Multi-location facility routing</li>
            <li>Map unknown SKUs to existing catalog</li>
            <li>Periodic reconciliation pull (missed webhook safety net)</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
