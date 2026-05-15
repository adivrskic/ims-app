import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/db";
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
  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);

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
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("sections").select("id", { count: "exact", head: true }),
    supabase.from("warehouses").select("id", { count: "exact", head: true }),
    supabase.from("locations").select("quantity"),
    supabase
      .from("scan_history")
      .select("id", { count: "exact", head: true })
      .gte("scanned_at", today.toISOString()),
    supabase
      .from("scan_history")
      .select("scanned_at")
      .gte("scanned_at", fourteenDaysAgo.toISOString()),
    supabase
      .from("scan_history")
      .select(
        "id, action, scanned_at, quantity, product:products ( name, barcode )"
      )
      .order("scanned_at", { ascending: false })
      .limit(10),
    supabase
      .from("products")
      .select(
        "id, name, barcode, reorder_point, category:categories ( name ), locations:locations ( quantity )"
      )
      .gt("reorder_point", 0),
  ]);

  // Compute low-stock list client-side (PostgREST can't aggregate easily here)
  const lowStock = (
    (stockByProduct ?? []) as Array<{
      id: string;
      name: string;
      barcode: string;
      reorder_point: number;
      category: { name: string } | { name: string }[] | null;
      locations: Array<{ quantity: number | null }> | null;
    }>
  )
    .map((p) => {
      const total = (p.locations ?? []).reduce(
        (sum, l) => sum + (l.quantity ?? 0),
        0
      );
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
        description="Live operations across all facilities."
        meta={[
          { label: "Facilities", value: warehouseCount ?? 0 },
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
              tone: (scansTodayCount ?? 0) > 0 ? "good" : "neutral",
            }}
          />
          <KpiCard
            label="Units on hand"
            value={totalStock.toLocaleString()}
            spark={trend.map((v) => v * 1.2 + 30)}
            delta={{ value: "Stable", direction: "flat", tone: "neutral" }}
          />
          <KpiCard
            label="SKUs tracked"
            value={(productCount ?? 0).toLocaleString()}
            spark={new Array(14).fill(productCount ?? 0)}
            delta={{ value: "All active", direction: "flat", tone: "good" }}
          />
          <KpiCard
            label="Sections"
            value={(sectionCount ?? 0).toLocaleString()}
            spark={trend.slice(-7)}
            delta={{ value: "Operational", direction: "flat", tone: "good" }}
          />
        </div>
      </section>

      <section aria-labelledby="reorder">
        <SectionTitle
          eyebrow="Attention"
          title="Reorder alerts"
          action={
            <CornerLink href="/inventory" variant="ghost" size="sm">
              All inventory →
            </CornerLink>
          }
        />
        <ReorderAlerts products={lowStock} />
      </section>

      <section aria-labelledby="activity">
        <SectionTitle
          eyebrow="Activity"
          title="Recent scans"
          action={
            <CornerLink href="/analytics" variant="ghost" size="sm">
              All activity →
            </CornerLink>
          }
        />

        {!recentScans || recentScans.length === 0 ? (
          <EmptyState
            title="No scan activity yet"
            description="Once operators start scanning on the mobile app, every pick, putaway, and adjustment will show up here in real time."
            icon={<Activity size={20} strokeWidth={1.5} />}
          />
        ) : (
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {recentScans.map(
              (scan: {
                id: string;
                action: string;
                scanned_at: string | null;
                quantity: number | null;
                product: unknown;
              }) => {
                const action = scan.action as ScanAction;
                const product = one(
                  scan.product as
                    | { name: string; barcode: string }
                    | { name: string; barcode: string }[]
                    | null
                );
                const time = scan.scanned_at
                  ? new Date(scan.scanned_at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—";
                return (
                  <li
                    key={scan.id}
                    className="px-16 py-10 flex items-center gap-12 row-interactive"
                  >
                    <span className="mono-sm text-text-dim tnum w-[44px] shrink-0">
                      {time}
                    </span>
                    <span
                      className={`label-text w-[38px] shrink-0 ${SCAN_TONE[action]}`}
                      style={{ fontWeight: 600 }}
                    >
                      {SCAN_LABEL[action]}
                    </span>
                    <div className="flex-1 min-w-0 flex items-center gap-12">
                      <p
                        className="text-text truncate"
                        style={{
                          fontFamily: "var(--display)",
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        {product?.name ?? "Unknown product"}
                      </p>
                      <span className="mono-sm text-text-dim shrink-0 hidden md:inline">
                        {product?.barcode ?? "—"}
                      </span>
                    </div>
                    {scan.quantity != null && (
                      <span className="mono-sm text-text-secondary tnum shrink-0">
                        qty {scan.quantity}
                      </span>
                    )}
                    <ArrowUpRight
                      size={12}
                      strokeWidth={1.5}
                      className="text-text-dim shrink-0"
                    />
                  </li>
                );
              }
            )}
          </ul>
        )}
      </section>

      <section aria-labelledby="surfaces">
        <SectionTitle eyebrow="Surfaces" title="Quick jump" />
        <GlowCardGrid
          cards={[
            {
              href: "/inventory",
              icon: <Boxes size={16} strokeWidth={1.5} />,
              label: "Inventory",
              description: "Every SKU across every facility.",
              meta: `${productCount ?? 0} SKUs`,
            },
            {
              href: "/analytics",
              icon: <BarChart3 size={16} strokeWidth={1.5} />,
              label: "Analytics",
              description: "Scan velocity, section utilization, action mix.",
              meta: "Real-time",
            },
            {
              href: "/settings",
              icon: <MapPin size={16} strokeWidth={1.5} />,
              label: "Facilities",
              description: "Warehouses, sections, and team access.",
              meta: "Configure",
            },
            {
              href: "/orders",
              icon: <ClipboardList size={16} strokeWidth={1.5} />,
              label: "Orders",
              description: "Installer jobs, customer pickups, transfers.",
              meta: "Live",
            },
            {
              href: "/purchase-orders",
              icon: <Truck size={16} strokeWidth={1.5} />,
              label: "Purchase Orders",
              description: "Draft, send, and receive supplier POs.",
              meta: "Live",
            },
            {
              href: "/integrations",
              icon: <Plug size={16} strokeWidth={1.5} />,
              label: "Integrations",
              description: "Shopify, QuickBooks, FedEx, and others.",
              meta: "Connect",
            },
          ]}
        />
      </section>
    </div>
  );
}
