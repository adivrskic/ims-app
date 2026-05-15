import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { ScanAction } from "@/types/db";
import { ArrowLeft, Activity } from "lucide-react";

const SCAN_LABEL: Record<ScanAction, string> = {
  register: "Registered",
  locate: "Located",
  relocate: "Relocated",
  pick: "Picked",
  receive: "Received",
  return: "Returned",
  cycle_count: "Counted",
  adjust: "Adjusted",
};

const SCAN_TONE: Record<ScanAction, "neutral" | "success" | "warning" | "info" | "accent" | "danger"> = {
  register: "success",
  locate: "info",
  relocate: "warning",
  pick: "accent",
  receive: "success",
  return: "danger",
  cycle_count: "neutral",
  adjust: "neutral",
};

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: product, error } = await supabase
    .from("products")
    .select(
      `
      id, name, barcode, internal_sku, manufacturer, weight, dimensions,
      notes, photo_url, reorder_point, created_at, updated_at,
      category:categories ( id, name ),
      locations:locations ( id, quantity, bay, level, placed_at,
        section:sections ( code, name ),
        warehouse:warehouses ( id, name )
      )
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !product) notFound();

  const { data: scans } = await supabase
    .from("scan_history")
    .select("id, action, scanned_at, quantity, notes")
    .eq("product_id", id)
    .order("scanned_at", { ascending: false })
    .limit(20);

  const category = Array.isArray(product.category) ? product.category[0] : product.category;
  const totalStock = (product.locations ?? []).reduce(
    (sum: number, l: { quantity: number | null }) => sum + (l.quantity ?? 0),
    0
  );

  return (
    <div className="flex flex-col gap-48">
      <Link
        href="/inventory"
        className="mono-sm text-text-muted hover:text-text inline-flex items-center gap-6 self-start"
      >
        <ArrowLeft size={12} strokeWidth={1.5} /> All inventory
      </Link>

      <PageHeader
        eyebrow={`Inventory · ${product.barcode}`}
        title={product.name}
        actions={category && <Badge tone="accent" variant="filled">{category.name}</Badge>}
      />

      <section
        aria-labelledby="kpi-heading"
        className="grid grid-cols-1 md:grid-cols-3 gap-16"
      >
        <h2 id="kpi-heading" className="sr-only">
          Product metrics
        </h2>
        <KpiCard label="Units on hand" value={totalStock.toLocaleString()} />
        <KpiCard
          label="Reorder point"
          value={(product.reorder_point ?? 0).toLocaleString()}
        />
        <KpiCard label="Locations" value={product.locations?.length ?? 0} />
      </section>

      <section
        aria-labelledby="details-heading"
        className="grid grid-cols-1 lg:grid-cols-3 gap-24"
      >
        <h2 id="details-heading" className="sr-only">Product details</h2>

        <article className="lg:col-span-2 hairline bg-[var(--surface)] p-24">
          <p className="label-text--lg mb-16">Specification</p>
          <dl className="grid grid-cols-2 gap-x-32 gap-y-16">
            <Detail label="Barcode" value={product.barcode} mono />
            <Detail label="Internal SKU" value={product.internal_sku} mono />
            <Detail label="Manufacturer" value={product.manufacturer} />
            <Detail label="Weight" value={product.weight} mono />
            <Detail label="Dimensions" value={product.dimensions} mono />
            <Detail
              label="Created"
              value={
                product.created_at
                  ? new Date(product.created_at).toLocaleString()
                  : null
              }
              mono
            />
          </dl>
          {product.notes && (
            <>
              <p className="label-text--lg mt-32 mb-12">Notes</p>
              <p className="body-text--display whitespace-pre-wrap">{product.notes}</p>
            </>
          )}
        </article>

        <article className="hairline bg-[var(--surface)] p-24">
          <p className="label-text--lg mb-16">Locations</p>
          {product.locations && product.locations.length > 0 ? (
            <ul className="flex flex-col gap-10">
              {product.locations.map((loc: {
                id: string;
                quantity: number | null;
                bay: number | null;
                level: number | null;
                section: { code: string | null; name: string | null } | { code: string | null; name: string | null }[] | null;
                warehouse: { id: string; name: string } | { id: string; name: string }[] | null;
              }) => {
                const sec = Array.isArray(loc.section) ? loc.section[0] : loc.section;
                const wh = Array.isArray(loc.warehouse) ? loc.warehouse[0] : loc.warehouse;
                return (
                  <li
                    key={loc.id}
                    className="hairline-subtle p-12 flex items-center justify-between gap-12 row-interactive"
                  >
                    <div className="min-w-0">
                      <p className="mono-body text-text">
                        {sec?.code?.trim() ?? "?"} · Bay {loc.bay} · L{loc.level}
                      </p>
                      <p className="mono-sm text-text-muted truncate">
                        {wh?.name ?? "Unknown facility"}
                        {sec?.name && ` · ${sec.name}`}
                      </p>
                    </div>
                    <span className="mono-body text-text tnum">
                      {(loc.quantity ?? 0).toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mono-sm text-text-dim">Not placed in any location yet.</p>
          )}
        </article>
      </section>

      <section aria-labelledby="scans-heading">
        <SectionTitle eyebrow="History" title="Last 20 scans" />
        {!scans || scans.length === 0 ? (
          <EmptyState
            title="No scans recorded"
            description="This product hasn't been touched on the floor yet."
            icon={<Activity size={24} strokeWidth={1.5} />}
          />
        ) : (
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {scans.map((scan: {
              id: string;
              action: string;
              scanned_at: string | null;
              quantity: number | null;
              notes: string | null;
            }) => {
              const action = scan.action as ScanAction;
              return (
                <li key={scan.id} className="px-20 py-16 flex items-center gap-16 row-interactive">
                  <time
                    className="mono-sm text-text-dim tnum w-[120px] shrink-0"
                    dateTime={scan.scanned_at ?? undefined}
                  >
                    {scan.scanned_at ? new Date(scan.scanned_at).toLocaleString() : "—"}
                  </time>
                  <span className="w-px h-12 bg-[var(--border-subtle)] shrink-0" aria-hidden />
                  <Badge tone={SCAN_TONE[action]} variant="filled">
                    {SCAN_LABEL[action]}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    {scan.quantity != null && (
                      <p className="mono-sm text-text-secondary">qty {scan.quantity}</p>
                    )}
                    {scan.notes && (
                      <p className="mono-sm text-text-muted truncate">{scan.notes}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="label-text mb-6">{label}</dt>
      <dd className={`${mono ? "mono-body" : "body-text--display"} text-text break-words`}>
        {value || <span className="text-text-dim">—</span>}
      </dd>
    </div>
  );
}
