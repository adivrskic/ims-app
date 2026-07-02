import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getShopifyMappingData } from "@/lib/data/shopifyMapping";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { CornerButton } from "@/components/ui/CornerButton";
import { PackageCheck, ChevronRight } from "lucide-react";
import { mapToExistingProduct, keepStubAsProduct } from "./actions";

export const metadata = { title: "Map Shopify products · Integrations" };

export default async function ShopifyMappingPage() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) redirect("/login");

  const { stubs, candidates } = await getShopifyMappingData(ctx.orgId);
  const canManage = ctx.can("integrations.manage");

  const totalLines = stubs.reduce((s, x) => s + x.lineCount, 0);

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        backHref="/integrations/shopify"
        backLabel="Shopify"
        eyebrow="Integrations · Shopify"
        title="Map imported products"
        description="Shopify order lines whose SKU didn't match your catalog were parked on auto-created placeholder products. Map each to a real product, or confirm it as a new one."
        meta={[
          { label: "Unmapped products", value: stubs.length },
          {
            label: "Order lines",
            value: totalLines,
            status: totalLines > 0 ? "live" : undefined,
          },
        ]}
      />

      {stubs.length === 0 ? (
        <EmptyState
          title="Everything's mapped"
          description="No Shopify order lines are waiting on a product mapping. New imports with unknown SKUs will show up here."
          icon={<PackageCheck size={20} strokeWidth={1.5} />}
        />
      ) : (
        <div className="flex flex-col gap-16">
          {stubs.map((stub) => {
            const options = candidates
              .filter((c) => c.id !== stub.stubProductId)
              .map((c) => ({
                value: c.id,
                label: c.name,
                hint: c.internal_sku ?? c.barcode ?? undefined,
              }));

            return (
              <section
                key={stub.stubProductId}
                className="hairline bg-[var(--surface)] p-20 flex flex-col gap-16"
              >
                <div className="flex items-start justify-between gap-14 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-8 mb-4">
                      <p
                        className="text-text truncate"
                        style={{
                          fontFamily: "var(--display)",
                          fontSize: 14,
                          fontWeight: 500,
                        }}
                      >
                        {stub.stubName}
                      </p>
                      <Badge tone="warning" variant="outline">
                        Needs mapping
                      </Badge>
                    </div>
                    <p className="mono-sm text-text-muted">
                      SKU {stub.externalSku || "—"} ·{" "}
                      {stub.lineCount} line{stub.lineCount === 1 ? "" : "s"} ·{" "}
                      {stub.orderCount} order{stub.orderCount === 1 ? "" : "s"} ·{" "}
                      {stub.totalQty.toLocaleString()} unit
                      {stub.totalQty === 1 ? "" : "s"}
                    </p>
                    {stub.sampleOrders.length > 0 && (
                      <p className="mono-sm text-text-dim mt-2" style={{ fontSize: 11 }}>
                        {stub.sampleOrders.join(", ")}
                        {stub.orderCount > stub.sampleOrders.length ? " …" : ""}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/inventory/${stub.stubProductId}`}
                    className="mono-sm text-text-muted hover:text-[var(--accent)] inline-flex items-center gap-4 transition-colors"
                  >
                    View placeholder <ChevronRight size={11} strokeWidth={1.5} />
                  </Link>
                </div>

                {canManage ? (
                  <form
                    action={mapToExistingProduct}
                    className="flex items-end gap-10 flex-wrap"
                  >
                    <input
                      type="hidden"
                      name="stub_product_id"
                      value={stub.stubProductId}
                    />
                    <div className="flex-1 min-w-[240px]">
                      <Select
                        name="target_product_id"
                        label="Map to existing product"
                        options={options}
                        placeholder={
                          options.length === 0
                            ? "No other products yet"
                            : "Search your catalog…"
                        }
                        searchable
                      />
                    </div>
                    <CornerButton type="submit" variant="primary" size="sm">
                      Map &amp; merge
                    </CornerButton>
                    <CornerButton
                      type="submit"
                      variant="ghost"
                      size="sm"
                      formAction={keepStubAsProduct}
                    >
                      Keep as new product
                    </CornerButton>
                  </form>
                ) : (
                  <p className="mono-sm text-text-dim">
                    Ask an admin to resolve these mappings (needs the
                    integrations permission).
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
