import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlowKpiGrid } from "@/components/dashboard/GlowKpiGrid";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerLink } from "@/components/ui/CornerButton";
import { GlowCardGrid } from "@/components/dashboard/GlowCardGrid";
import { ReorderAlerts } from "@/components/dashboard/ReorderAlerts";
import { OverviewRealtime } from "@/components/realtime/PageRealtime";
import type { ScanAction } from "@/types/db";
import {
  ArrowUpRight,
  Boxes,
  MapPin,
  Activity,
  BarChart3,
  ClipboardList,
  Plug,
  Truck,
} from "lucide-react";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getOverviewData } from "@/lib/data/overview";

export const metadata = { title: "Overview" };

const SCAN_LABEL: Record<ScanAction, string> = {
  register: "REG",
  locate: "LOC",
  relocate: "MOV",
  pick: "PICK",
  receive: "RCV",
  return: "RET",
  cycle_count: "CNT",
  adjust: "ADJ",
};

const SCAN_TONE: Record<ScanAction, string> = {
  register: "text-[var(--success)]",
  locate: "text-[var(--info)]",
  relocate: "text-[var(--warning)]",
  pick: "text-[var(--accent)]",
  receive: "text-[var(--success)]",
  return: "text-[var(--danger)]",
  cycle_count: "text-text-muted",
  adjust: "text-text-muted",
};

function bucketByDay(scans: { scanned_at: string | null }[]): number[] {
  const buckets = new Array<number>(14).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  scans.forEach((s) => {
    if (!s.scanned_at) return;
    const d = new Date(s.scanned_at);
    d.setHours(0, 0, 0, 0);
    const idx = 13 - Math.floor((todayMs - d.getTime()) / 86400000);
    if (idx >= 0 && idx < 14) buckets[idx]++;
  });
  return buckets;
}

export default async function OverviewPage() {
  const scope = await getActiveScope();

  const ctx = await getCurrentOrgContext();
  const facilityId = scope.mode === "single" ? scope.id : null;
  const data = ctx ? await getOverviewData(ctx.orgId, facilityId) : null;

  const productCount = data?.productCount ?? 0;
  const sectionCount = data?.sectionCount ?? 0;
  const warehouseCount = data?.warehouseCount ?? 0;
  const scansTodayCount = data?.scansTodayCount ?? 0;
  const stockRows = data?.stockRows ?? [];
  const scans14d = data?.scans14d ?? [];
  const recentScans = data?.recentScans ?? [];
  const stockByProduct = data?.stockByProduct ?? [];
  const validSectionIds = data?.validSectionIds
    ? new Set(data.validSectionIds)
    : null;

  const lowStock = (
    (stockByProduct ?? []) as Array<{
      id: string;
      name: string;
      barcode: string;
      reorder_point: number;
      category: { name: string } | { name: string }[] | null;
      locations: Array<{
        quantity: number | null;
        section_id: string | null;
      }> | null;
    }>
  )
    .map((p) => {
      const relevantLocs = validSectionIds
        ? (p.locations ?? []).filter(
            (l) => l.section_id && validSectionIds!.has(l.section_id)
          )
        : p.locations ?? [];
      const total = relevantLocs.reduce((sum, l) => sum + (l.quantity ?? 0), 0);
      const cat = Array.isArray(p.category) ? p.category[0] : p.category;
      return {
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        reorder_point: p.reorder_point,
        total,
        category_name: cat?.name ?? null,
      };
    })
    .filter((p) => p.total <= p.reorder_point)
    .sort((a, b) => a.total - a.reorder_point - (b.total - b.reorder_point))
    .slice(0, 6);

  const totalStock = (stockRows ?? []).reduce(
    (sum, row: { quantity: number | null }) => sum + (row.quantity ?? 0),
    0
  );
  const trend = bucketByDay(
    (scans14d ?? []) as { scanned_at: string | null }[]
  );
  const totalScans14 = trend.reduce((a, b) => a + b, 0);

  return (
    <PageHeader
      live
      eyebrow="Workspace"
      title="Overview"
      description={scopeDescription(scope, {
        all: "Live operations across all facilities.",
        single: (name) => `Live operations at ${name}.`,
      })}
      meta={[
        {
          label: scope.mode === "single" ? "Facility" : "Facilities",
          value: scope.mode === "single" ? scope.name : warehouseCount ?? 0,
        },
        { label: "Last sync", value: "Just now", status: "live" },
      ]}
      actions={
        <CornerLink href="/kiosk" variant="ghost" size="sm">
          Kiosk view →
        </CornerLink>
      }
    >
      <OverviewRealtime
        warehouseId={scope.mode === "single" ? scope.id : null}
      />

      <section aria-labelledby="signals">
        <h2 id="signals" className="sr-only">
          Headline metrics
        </h2>
        <GlowKpiGrid
          kpis={[
            {
              label: "Scans · today",
              value: (scansTodayCount ?? 0).toLocaleString(),
              spark: trend,
              delta: {
                value: `${totalScans14.toLocaleString()} in 14d`,
                direction: (scansTodayCount ?? 0) > 0 ? "up" : "flat",
                tone: "neutral",
              },
            },
            {
              label: "Units on hand",
              value: totalStock.toLocaleString(),
              spark: new Array(14).fill(totalStock),
            },
            {
              label: "Products",
              value: (productCount ?? 0).toLocaleString(),
              spark: new Array(14).fill(productCount ?? 0),
            },
            {
              label: scope.mode === "single" ? "Sections here" : "Sections",
              value: (sectionCount ?? 0).toLocaleString(),
              spark: new Array(14).fill(sectionCount ?? 0),
            },
          ]}
        />
      </section>

      {lowStock.length > 0 && (
        <section aria-labelledby="alerts">
          <SectionTitle
            numeral="02"
            eyebrow="Reorder"
            title={
              scope.mode === "single"
                ? `Below threshold at ${scope.name}`
                : "Below threshold"
            }
            action={
              <CornerLink href="/purchase-orders" variant="ghost" size="sm">
                <Truck size={11} strokeWidth={1.5} />
                Purchase orders
              </CornerLink>
            }
          />
          <ReorderAlerts products={lowStock} />{" "}
        </section>
      )}

      <section aria-labelledby="recent-scans">
        <SectionTitle numeral="03" eyebrow="Activity" title="Recent scans" />
        {(recentScans?.length ?? 0) === 0 ? (
          <EmptyState
            title={
              scope.mode === "single"
                ? `No scans at ${scope.name} yet`
                : "No scans yet"
            }
            description="Once your team starts scanning, recent activity will stream here in real time."
            icon={<Activity size={20} strokeWidth={1.5} />}
          />
        ) : (
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {(
              (recentScans ?? []) as Array<{
                id: string;
                action: ScanAction;
                scanned_at: string | null;
                quantity: number | null;
                product:
                  | { name: string; barcode: string }
                  | { name: string; barcode: string }[]
                  | null;
              }>
            ).map((s) => {
              const product = Array.isArray(s.product)
                ? s.product[0]
                : s.product;
              return (
                <li key={s.id} className="px-20 py-12 flex items-center gap-14">
                  <span
                    className={`mono-sm tnum w-[48px] shrink-0 ${
                      SCAN_TONE[s.action]
                    }`}
                    style={{ fontWeight: 500 }}
                  >
                    {SCAN_LABEL[s.action]}
                  </span>
                  <span
                    className="flex-1 min-w-0 truncate text-text"
                    style={{ fontFamily: "var(--display)", fontSize: 13 }}
                  >
                    {product?.name ?? "—"}
                  </span>
                  <span className="mono-sm text-text-muted tnum">
                    {s.quantity ?? "—"}
                  </span>
                  <time
                    className="mono-sm text-text-dim tnum"
                    dateTime={s.scanned_at ?? undefined}
                  >
                    {s.scanned_at
                      ? new Date(s.scanned_at).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="quick-jump">
        <SectionTitle numeral="04" eyebrow="Navigate" title="Quick jump" />
        <GlowCardGrid
          cards={[
            {
              href: "/inventory",
              icon: <Boxes size={16} strokeWidth={1.5} />,
              label: "Inventory",
              description:
                "Every SKU in the catalog with on-hand counts and locations.",
            },
            {
              href: "/orders",
              icon: <ClipboardList size={16} strokeWidth={1.5} />,
              label: "Orders",
              description: "Pick lists, deliveries, and customer pickups.",
            },
            {
              href: "/analytics",
              icon: <BarChart3 size={16} strokeWidth={1.5} />,
              label: "Analytics",
              description: "Velocity, distribution, and action mix.",
            },
            {
              href: "/facilities",
              icon: <MapPin size={16} strokeWidth={1.5} />,
              label: "Facilities",
              description: "Warehouses, sections, and team access.",
            },
            {
              href: "/integrations",
              icon: <Plug size={16} strokeWidth={1.5} />,
              label: "Integrations",
              description: "Shopify, QuickBooks, ShipStation, and more.",
            },
          ]}
        />
      </section>
    </PageHeader>
  );
}
