import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerLink } from "@/components/ui/CornerButton";
import { GlowCardGrid } from "@/components/dashboard/GlowCardGrid";
import { ReorderAlerts } from "@/components/dashboard/ReorderAlerts";
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
  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);

  /*
   * Pre-fetch valid section IDs for the active facility so low-stock
   * calculations only count units physically located there. Same
   * pattern as the inventory page — keeps the catalog visible but
   * shows accurate on-hand at the active facility.
   */
  let validSectionIds: Set<string> | null = null;
  if (scope.mode === "single") {
    const { data: sec } = await supabase
      .from("sections")
      .select("id")
      .eq("warehouse_id", scope.id);
    validSectionIds = new Set((sec ?? []).map((s) => s.id));
  }

  /*
   * What gets scoped vs. what stays workspace-wide:
   *
   * - products count:    NOT scoped — the catalog is org-level
   * - sections count:    scoped     — sections belong to a facility
   * - warehouses count:  NOT scoped — always show full count
   * - locations stock:   scoped     — locations have warehouse_id directly
   * - scan_history (×3): scoped     — scan_history has warehouse_id
   * - low-stock products: catalog stays, but per-product on-hand is
   *                       calculated only from active-facility sections
   */
  const productsQuery = supabase
    .from("products")
    .select("id", { count: "exact", head: true });

  let sectionsQuery = supabase
    .from("sections")
    .select("id", { count: "exact", head: true });
  if (scope.mode === "single") {
    sectionsQuery = sectionsQuery.eq("warehouse_id", scope.id);
  }

  const warehousesQuery = supabase
    .from("warehouses")
    .select("id", { count: "exact", head: true });

  let stockQuery = supabase.from("locations").select("quantity");
  if (scope.mode === "single") {
    stockQuery = stockQuery.eq("warehouse_id", scope.id);
  }

  let scansTodayQuery = supabase
    .from("scan_history")
    .select("id", { count: "exact", head: true })
    .gte("scanned_at", today.toISOString());
  if (scope.mode === "single") {
    scansTodayQuery = scansTodayQuery.eq("warehouse_id", scope.id);
  }

  let scans14dQuery = supabase
    .from("scan_history")
    .select("scanned_at")
    .gte("scanned_at", fourteenDaysAgo.toISOString());
  if (scope.mode === "single") {
    scans14dQuery = scans14dQuery.eq("warehouse_id", scope.id);
  }

  let recentScansQuery = supabase
    .from("scan_history")
    .select(
      "id, action, scanned_at, quantity, product:products ( name, barcode )"
    )
    .order("scanned_at", { ascending: false })
    .limit(10);
  if (scope.mode === "single") {
    recentScansQuery = recentScansQuery.eq("warehouse_id", scope.id);
  }

  const stockByProductQuery = supabase
    .from("products")
    .select(
      "id, name, barcode, reorder_point, category:categories ( name ), locations:locations ( quantity, section_id )"
    )
    .gt("reorder_point", 0);

  const [
    { count: productCount },
    { count: sectionCount },
    { count: warehouseCount },
    { data: stockRows },
    { count: scansTodayCount },
    { data: scans14d },
    { data: recentScans },
    { data: stockByProduct },
  ] = await Promise.all([
    productsQuery,
    sectionsQuery,
    warehousesQuery,
    stockQuery,
    scansTodayQuery,
    scans14dQuery,
    recentScansQuery,
    stockByProductQuery,
  ]);

  /*
   * Low-stock: post-filter the embedded locations by the active
   * facility's section IDs. Products with no locations at the facility
   * collapse to total = 0, which triggers the reorder alert correctly
   * — at the active facility, they ARE out of stock.
   */
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
    <div className="flex flex-col gap-32">
      <PageHeader
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
      />

      <section aria-labelledby="signals">
        <h2 id="signals" className="sr-only">
          Headline metrics
        </h2>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-12">
          <KpiCard
            label="Scans · today"
            value={(scansTodayCount ?? 0).toLocaleString()}
            spark={trend}
            delta={{
              value: `${totalScans14.toLocaleString()} in 14d`,
              direction: (scansTodayCount ?? 0) > 0 ? "up" : "flat",
              tone: "accent",
            }}
          />
          <KpiCard
            label="Units on hand"
            value={totalStock.toLocaleString()}
            spark={new Array(14).fill(totalStock)}
          />
          <KpiCard
            label="Products"
            value={(productCount ?? 0).toLocaleString()}
            spark={new Array(14).fill(productCount ?? 0)}
          />
          <KpiCard
            label={scope.mode === "single" ? "Sections here" : "Sections"}
            value={(sectionCount ?? 0).toLocaleString()}
            spark={new Array(14).fill(sectionCount ?? 0)}
          />
        </div>
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
    </div>
  );
}
