import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProviderLogo } from "@/components/integrations/ProviderLogo";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getUnmappedCount } from "@/lib/data/shopifyMapping";
import { createAdminClient } from "@/lib/supabase/admin";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { PROVIDERS } from "../providers";
import { ShopifyConfigClient } from "./ShopifyConfigClient";
import type { ShopifyConfig } from "@/lib/integrations/shopify/types";

export const metadata = { title: "Shopify · Integrations" };

interface PageProps {
  searchParams: Promise<{ ok?: string; err?: string }>;
}

export default async function ShopifyPage({ searchParams }: PageProps) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) redirect("/login");

  const { ok, err } = await searchParams;
  const info = PROVIDERS.find((p) => p.key === "shopify")!;

  const admin = createAdminClient();
  const [
    integrationResult,
    facilitiesResult,
    recentOrdersResult,
    recentLogResult,
  ] = await Promise.all([
    admin
      .from("integrations")
      .select(
        "id, status, external_account_id, config, last_synced_at, last_error, connected_at"
      )
      .eq("org_id", ctx.orgId)
      .eq("provider", "shopify")
      .maybeSingle(),
    admin
      .from("warehouses")
      .select("id, name")
      .eq("org_id", ctx.orgId)
      .eq("is_active", true)
      .order("name"),
    admin
      .from("orders")
      .select(
        "id, order_number, customer_name, total, currency, status, placed_at, external_synced_at"
      )
      .eq("org_id", ctx.orgId)
      .eq("source", "shopify")
      .order("placed_at", { ascending: false })
      .limit(10),
    admin
      .from("shopify_webhook_log")
      .select("id, topic, received_at, processed_at, process_error")
      .eq("org_id", ctx.orgId)
      .order("received_at", { ascending: false })
      .limit(15),
  ]);

  const integration = integrationResult.data;
  const facilities = facilitiesResult.data ?? [];
  const recentOrders = recentOrdersResult.data ?? [];
  const recentLog = recentLogResult.data ?? [];
  const unmappedCount = await getUnmappedCount(ctx.orgId);

  return (
    <div className="flex flex-col gap-32">
      <div className="flex items-start gap-16">
        <ProviderLogo provider={info} size={56} />
        <PageHeader
          backHref="/integrations"
          backLabel="All integrations"
          eyebrow={info.category}
          title="Shopify"
          description="Sync incoming orders from your storefront. New orders arrive in Nautilus within seconds; cancellations sync automatically. Outbound inventory updates and fulfillment marking are coming in v2."
        />
      </div>

      {unmappedCount > 0 && (
        <Link
          href="/integrations/shopify/mapping"
          className="hairline-subtle border-[rgba(245,181,69,0.45)] bg-[var(--warning-dim)] px-16 py-12 flex items-center gap-12 hover:border-[var(--warning)] transition-colors"
        >
          <AlertTriangle
            size={16}
            strokeWidth={1.5}
            className="text-[var(--warning)] shrink-0"
            aria-hidden
          />
          <div className="flex-1 min-w-0">
            <p
              className="text-text"
              style={{ fontFamily: "var(--display)", fontSize: 13, fontWeight: 500 }}
            >
              {unmappedCount} order line{unmappedCount === 1 ? "" : "s"} need
              product mapping
            </p>
            <p className="mono-sm text-text-secondary">
              Imported SKUs that didn't match your catalog are parked on
              placeholder products — resolve them so stock and reporting stay
              accurate.
            </p>
          </div>
          <span className="mono-sm text-[var(--warning)] inline-flex items-center gap-4 shrink-0">
            Review <ChevronRight size={12} strokeWidth={1.5} />
          </span>
        </Link>
      )}

      <ShopifyConfigClient
        integration={
          integration
            ? {
                status: integration.status as
                  | "connected"
                  | "error"
                  | "disconnected",
                shop_domain: integration.external_account_id ?? "",
                config:
                  (integration.config as unknown as ShopifyConfig) ?? null,
                last_synced_at: integration.last_synced_at,
                last_error: integration.last_error,
                connected_at: integration.connected_at,
              }
            : null
        }
        facilities={facilities}
        recentOrders={recentOrders}
        recentLog={recentLog}
        ok={ok}
        err={err}
      />
    </div>
  );
}
