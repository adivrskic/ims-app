import { PageHeader } from "@/components/ui/PageHeader";
import { GlowKpiGrid } from "@/components/dashboard/GlowKpiGrid";
import { formatCurrency } from "@/lib/dashboard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerLink } from "@/components/ui/CornerButton";
import { GlowCardGrid } from "@/components/dashboard/GlowCardGrid";
import { ReorderAlerts } from "@/components/dashboard/ReorderAlerts";
import { OverviewRealtime } from "@/components/realtime/PageRealtime";
import type { ScanAction } from "@/types/db";
import {
  Boxes,
  MapPin,
  Activity,
  BarChart3,
  ClipboardList,
  Plug,
  Truck,
  TrendingUp,
} from "lucide-react";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getOverviewData } from "@/lib/data/overview";
import { getKioskData, type KioskData } from "@/lib/data/kiosk";

export const metadata = { title: "Overview" };

type Role = "owner" | "admin" | "member";

const SCAN_LABEL: Record<ScanAction, string> = {
  register: "REG",
  locate: "LOC",
  relocate: "MOV",
  pick: "PICK",
  receive: "RCV",
  return: "RET",
  cycle_count: "CNT",
  adjust: "ADJ",
  putaway: "PUT",
  transfer: "XFER",
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
  putaway: "text-[var(--success)]",
  transfer: "text-[var(--warning)]",
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  created: "Created",
  pick_list_assigned: "Assigned",
  in_progress: "Picking",
  staged: "Staged",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  sent: "Sent",
  partially_received: "Partial",
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

const flat = (n: number) => new Array(14).fill(n);

/* ── View model shared across the three role layouts ───────────────────── */

interface OverviewVM {
  scope: Awaited<ReturnType<typeof getActiveScope>>;
  // inventory / activity (getOverviewData)
  scansTodayCount: number;
  totalScans14: number;
  trend: number[];
  totalStock: number;
  productCount: number;
  sectionCount: number;
  lowStock: Array<{
    id: string;
    name: string;
    barcode: string;
    reorder_point: number;
    total: number;
    category_name: string | null;
  }>;
  recentScans: Array<{
    id: string;
    action: ScanAction;
    scanned_at: string | null;
    quantity: number | null;
    product:
      | { name: string; barcode: string }
      | { name: string; barcode: string }[]
      | null;
  }>;
  // order flow (getKioskData)
  openOrdersCount: number;
  pickQueue: KioskData["pickQueue"];
  posInTransit: KioskData["posInTransit"];
  topMovers: KioskData["topMovers"];
  lowStockCount: number;
  // financial signals (getOverviewData → app.overview_financials)
  inventoryValue: number;
  deadStockValue: number;
  deadStockSkus: number;
}

export default async function OverviewPage() {
  const scope = await getActiveScope();
  const ctx = await getCurrentOrgContext();
  const role: Role = (ctx?.role as Role) ?? "member";

  const facilityId = scope.mode === "single" ? scope.id : null;
  const [data, kiosk] = ctx
    ? await Promise.all([
        getOverviewData(ctx.orgId, facilityId),
        getKioskData(ctx.orgId, facilityId),
      ])
    : [null, null];

  const productCount = data?.productCount ?? 0;
  const sectionCount = data?.sectionCount ?? 0;
  const warehouseCount = data?.warehouseCount ?? 0;
  const scansTodayCount = data?.scansTodayCount ?? 0;
  const stockRows = data?.stockRows ?? [];
  const scans14d = data?.scans14d ?? [];
  const recentScans = (data?.recentScans ?? []) as OverviewVM["recentScans"];
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
  const trend = bucketByDay(scans14d as { scanned_at: string | null }[]);
  const totalScans14 = trend.reduce((a, b) => a + b, 0);

  const vm: OverviewVM = {
    scope,
    scansTodayCount,
    totalScans14,
    trend,
    totalStock,
    productCount,
    sectionCount,
    lowStock,
    recentScans,
    openOrdersCount: kiosk?.openOrdersCount ?? 0,
    pickQueue: kiosk?.pickQueue ?? [],
    posInTransit: kiosk?.posInTransit ?? [],
    topMovers: kiosk?.topMovers ?? [],
    lowStockCount: kiosk?.lowStockCount ?? lowStock.length,
    inventoryValue: data?.financials.inventoryValue ?? 0,
    deadStockValue: data?.financials.deadStockValue ?? 0,
    deadStockSkus: data?.financials.deadStockSkus ?? 0,
  };

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
        // Backed by the OverviewRealtime subscription below — the page refreshes
        // on live changes, so report the live status rather than a fabricated
        // "Just now" timestamp.
        { label: "Status", value: "Live", status: "live" },
      ]}
      actions={
        <CornerLink href="/kiosk" variant="ghost" size="sm">
          Kiosk view →
        </CornerLink>
      }
    >
      <OverviewRealtime warehouseId={facilityId} />

      {role === "owner" ? (
        <OwnerOverview vm={vm} />
      ) : role === "admin" ? (
        <AdminOverview vm={vm} />
      ) : (
        <MemberOverview vm={vm} />
      )}
    </PageHeader>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * Role layouts
 * ════════════════════════════════════════════════════════════════════════ */

/* MEMBER — floor operator. Actionable queues only; no money, no rollups. */
function MemberOverview({ vm }: { vm: OverviewVM }) {
  return (
    <>
      <section aria-labelledby="signals">
        <h2 id="signals" className="sr-only">
          Today
        </h2>
        <GlowKpiGrid
          kpis={[
            {
              label: "Scans · today",
              value: vm.scansTodayCount.toLocaleString(),
              spark: vm.trend,
              delta: {
                value: `${vm.totalScans14.toLocaleString()} in 14d`,
                direction: vm.scansTodayCount > 0 ? "up" : "flat",
                tone: "neutral",
              },
            },
            {
              label: "Open orders",
              value: vm.openOrdersCount.toLocaleString(),
              spark: flat(vm.openOrdersCount),
            },
            {
              label: "In pick queue",
              value: vm.pickQueue.length.toLocaleString(),
              spark: flat(vm.pickQueue.length),
            },
            {
              label: "Low stock",
              value: vm.lowStockCount.toLocaleString(),
              delta: {
                value: vm.lowStockCount > 0 ? "Needs reorder" : "All stocked",
                direction: vm.lowStockCount > 0 ? "down" : "flat",
                tone: vm.lowStockCount > 0 ? "bad" : "good",
              },
            },
          ]}
        />
      </section>

      <ReorderSection vm={vm} numeral="02" />
      <PickQueueSection pickQueue={vm.pickQueue} numeral="03" />
      <RecentScansSection vm={vm} numeral="04" />

      <QuickJump
        numeral="05"
        cards={[CARD.inventory, CARD.orders, CARD.facilities]}
      />
    </>
  );
}

/* ADMIN — ops lead. Run-the-floor: order flow + inventory + movers. */
function AdminOverview({ vm }: { vm: OverviewVM }) {
  return (
    <>
      <section aria-labelledby="order-flow">
        <SectionTitle numeral="01" eyebrow="Order flow" title="In motion" />
        <GlowKpiGrid
          kpis={[
            {
              label: "Open orders",
              value: vm.openOrdersCount.toLocaleString(),
              spark: flat(vm.openOrdersCount),
            },
            {
              label: "In pick queue",
              value: vm.pickQueue.length.toLocaleString(),
              spark: flat(vm.pickQueue.length),
            },
            {
              label: "POs in transit",
              value: vm.posInTransit.length.toLocaleString(),
              spark: flat(vm.posInTransit.length),
            },
            {
              label: "Low stock",
              value: vm.lowStockCount.toLocaleString(),
              delta: {
                value: vm.lowStockCount > 0 ? "Needs reorder" : "All stocked",
                direction: vm.lowStockCount > 0 ? "down" : "flat",
                tone: vm.lowStockCount > 0 ? "bad" : "good",
              },
            },
          ]}
        />
      </section>

      <section aria-labelledby="inventory-signals">
        <SectionTitle numeral="02" eyebrow="Inventory" title="On hand" />
        <GlowKpiGrid
          kpis={[
            {
              label: "Scans · today",
              value: vm.scansTodayCount.toLocaleString(),
              spark: vm.trend,
              delta: {
                value: `${vm.totalScans14.toLocaleString()} in 14d`,
                direction: vm.scansTodayCount > 0 ? "up" : "flat",
                tone: "neutral",
              },
            },
            {
              label: "Units on hand",
              value: vm.totalStock.toLocaleString(),
              spark: flat(vm.totalStock),
            },
            {
              label: "Products",
              value: vm.productCount.toLocaleString(),
              spark: flat(vm.productCount),
            },
            {
              label: vm.scope.mode === "single" ? "Sections here" : "Sections",
              value: vm.sectionCount.toLocaleString(),
              spark: flat(vm.sectionCount),
            },
          ]}
        />
      </section>

      <ReorderSection vm={vm} numeral="03" />

      {/* Pick queue + POs side by side on wide screens. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-32">
        <PickQueueSection pickQueue={vm.pickQueue} numeral="04" />
        <PoSection posInTransit={vm.posInTransit} numeral="05" />
      </div>

      <MoversSection topMovers={vm.topMovers} numeral="06" />
      <RecentScansSection vm={vm} numeral="07" />

      <QuickJump
        numeral="08"
        cards={[
          CARD.inventory,
          CARD.orders,
          CARD.analytics,
          CARD.facilities,
          CARD.integrations,
        ]}
      />
    </>
  );
}

/* OWNER — exec summary. Rollups + velocity; operational digest beneath. */
function OwnerOverview({ vm }: { vm: OverviewVM }) {
  return (
    <>
      <section aria-labelledby="signals">
        <h2 id="signals" className="sr-only">
          Headline
        </h2>
        <GlowKpiGrid
          kpis={[
            {
              label: "Scan velocity · today",
              value: vm.scansTodayCount.toLocaleString(),
              spark: vm.trend,
              delta: {
                value: `${vm.totalScans14.toLocaleString()} in 14d`,
                direction: vm.scansTodayCount > 0 ? "up" : "flat",
                tone: "neutral",
              },
            },
            {
              label: "Units on hand",
              value: vm.totalStock.toLocaleString(),
              spark: flat(vm.totalStock),
            },
            {
              label: "Open orders",
              value: vm.openOrdersCount.toLocaleString(),
              spark: flat(vm.openOrdersCount),
            },
            {
              label: "Low stock",
              value: vm.lowStockCount.toLocaleString(),
              delta: {
                value: vm.lowStockCount > 0 ? "Needs reorder" : "All stocked",
                direction: vm.lowStockCount > 0 ? "down" : "flat",
                tone: vm.lowStockCount > 0 ? "bad" : "good",
              },
            },
            {
              label: "Inventory value",
              value: formatCurrency(vm.inventoryValue),
              spark: flat(vm.inventoryValue),
              delta:
                vm.inventoryValue === 0
                  ? {
                      value: "Set unit costs",
                      direction: "flat",
                      tone: "neutral",
                    }
                  : undefined,
            },
            {
              label: "Capital in dead stock",
              value: formatCurrency(vm.deadStockValue),
              delta: {
                value:
                  vm.deadStockSkus > 0
                    ? `${vm.deadStockSkus.toLocaleString()} dormant SKU${
                        vm.deadStockSkus === 1 ? "" : "s"
                      }`
                    : "Nothing dormant",
                direction: vm.deadStockValue > 0 ? "down" : "flat",
                tone: vm.deadStockValue > 0 ? "bad" : "good",
              },
            },
          ]}
        />
      </section>

      <MoversSection topMovers={vm.topMovers} numeral="02" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-32">
        <PickQueueSection pickQueue={vm.pickQueue} numeral="03" />
        <PoSection posInTransit={vm.posInTransit} numeral="04" />
      </div>

      <ReorderSection vm={vm} numeral="05" />

      <QuickJump
        numeral="06"
        cards={[
          CARD.analytics,
          CARD.inventory,
          CARD.orders,
          CARD.facilities,
          CARD.integrations,
        ]}
      />
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * Shared sections
 * ════════════════════════════════════════════════════════════════════════ */

function ReorderSection({ vm, numeral }: { vm: OverviewVM; numeral: string }) {
  if (vm.lowStock.length === 0) return null;
  return (
    <section aria-labelledby="alerts">
      <SectionTitle
        numeral={numeral}
        eyebrow="Reorder"
        title={
          vm.scope.mode === "single"
            ? `Below threshold at ${vm.scope.name}`
            : "Below threshold"
        }
        action={
          <CornerLink href="/purchase-orders" variant="ghost" size="sm">
            <Truck size={11} strokeWidth={1.5} />
            Purchase orders
          </CornerLink>
        }
      />
      <ReorderAlerts products={vm.lowStock} />
    </section>
  );
}

function PickQueueSection({
  pickQueue,
  numeral,
}: {
  pickQueue: OverviewVM["pickQueue"];
  numeral: string;
}) {
  return (
    <section aria-labelledby="pick-queue">
      <SectionTitle
        numeral={numeral}
        eyebrow="Fulfilment"
        title="Pick queue"
        action={
          <CornerLink href="/orders" variant="ghost" size="sm">
            <ClipboardList size={11} strokeWidth={1.5} />
            Orders
          </CornerLink>
        }
      />
      {pickQueue.length === 0 ? (
        <EmptyState
          title="Pick queue is clear"
          description="Orders assigned for picking will appear here."
          icon={<ClipboardList size={20} strokeWidth={1.5} />}
        />
      ) : (
        <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
          {pickQueue.slice(0, 6).map((o, i) => (
            <li key={i} className="px-20 py-12 flex items-center gap-14">
              <span
                className="flex-1 min-w-0 truncate text-text"
                style={{ fontFamily: "var(--display)", fontSize: 13 }}
              >
                {o.order_number ?? o.customer_name ?? "—"}
              </span>
              <span className="mono-sm text-[var(--accent)] shrink-0">
                {ORDER_STATUS_LABEL[o.status] ?? o.status}
              </span>
              <span className="mono-sm text-text-muted tnum shrink-0">
                {o.item_count} {o.item_count === 1 ? "item" : "items"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PoSection({
  posInTransit,
  numeral,
}: {
  posInTransit: OverviewVM["posInTransit"];
  numeral: string;
}) {
  return (
    <section aria-labelledby="pos-in-transit">
      <SectionTitle
        numeral={numeral}
        eyebrow="Inbound"
        title="POs in transit"
        action={
          <CornerLink href="/purchase-orders" variant="ghost" size="sm">
            <Truck size={11} strokeWidth={1.5} />
            Purchase orders
          </CornerLink>
        }
      />
      {posInTransit.length === 0 ? (
        <EmptyState
          title="Nothing inbound"
          description="Purchase orders that have shipped will appear here until received."
          icon={<Truck size={20} strokeWidth={1.5} />}
        />
      ) : (
        <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
          {posInTransit.slice(0, 6).map((po, i) => (
            <li key={i} className="px-20 py-12 flex items-center gap-14">
              <span
                className="flex-1 min-w-0 truncate text-text"
                style={{ fontFamily: "var(--display)", fontSize: 13 }}
              >
                {po.po_number ?? po.supplier_name ?? "PO"}
              </span>
              <span className="mono-sm text-[var(--info)] shrink-0">
                {ORDER_STATUS_LABEL[po.status] ?? po.status}
              </span>
              <time
                className="mono-sm text-text-dim tnum shrink-0"
                dateTime={po.expected_date ?? undefined}
              >
                {po.expected_date
                  ? new Date(po.expected_date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  : "—"}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MoversSection({
  topMovers,
  numeral,
}: {
  topMovers: OverviewVM["topMovers"];
  numeral: string;
}) {
  return (
    <section aria-labelledby="movers">
      <SectionTitle
        numeral={numeral}
        eyebrow="Velocity"
        title="Top movers · 14d"
        action={
          <CornerLink href="/analytics" variant="ghost" size="sm">
            <BarChart3 size={11} strokeWidth={1.5} />
            Analytics
          </CornerLink>
        }
      />
      {topMovers.length === 0 ? (
        <EmptyState
          title="No movement yet"
          description="Once scanning activity builds up, your most-active SKUs will rank here."
          icon={<TrendingUp size={20} strokeWidth={1.5} />}
        />
      ) : (
        <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
          {topMovers.slice(0, 5).map((m) => (
            <li
              key={m.product_id}
              className="px-20 py-12 flex items-center gap-14"
            >
              <span
                className="flex-1 min-w-0 truncate text-text"
                style={{ fontFamily: "var(--display)", fontSize: 13 }}
              >
                {m.name}
              </span>
              <span className="mono-sm text-[var(--accent)] tnum shrink-0">
                {m.scans.toLocaleString()} scans
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentScansSection({
  vm,
  numeral,
}: {
  vm: OverviewVM;
  numeral: string;
}) {
  return (
    <section aria-labelledby="recent-scans">
      <SectionTitle numeral={numeral} eyebrow="Activity" title="Recent scans" />
      {vm.recentScans.length === 0 ? (
        <EmptyState
          title={
            vm.scope.mode === "single"
              ? `No scans at ${vm.scope.name} yet`
              : "No scans yet"
          }
          description="Once your team starts scanning, recent activity will stream here in real time."
          icon={<Activity size={20} strokeWidth={1.5} />}
        />
      ) : (
        <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
          {vm.recentScans.map((s) => {
            const product = Array.isArray(s.product) ? s.product[0] : s.product;
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
  );
}

/* ── Quick-jump cards ──────────────────────────────────────────────────── */

const CARD = {
  inventory: {
    href: "/inventory",
    icon: <Boxes size={16} strokeWidth={1.5} />,
    label: "Inventory",
    description: "Every SKU in the catalog with on-hand counts and locations.",
  },
  orders: {
    href: "/orders",
    icon: <ClipboardList size={16} strokeWidth={1.5} />,
    label: "Orders",
    description: "Pick lists, deliveries, and customer pickups.",
  },
  analytics: {
    href: "/analytics",
    icon: <BarChart3 size={16} strokeWidth={1.5} />,
    label: "Analytics",
    description: "Velocity, distribution, and action mix.",
  },
  facilities: {
    href: "/facilities",
    icon: <MapPin size={16} strokeWidth={1.5} />,
    label: "Facilities",
    description: "Warehouses, sections, and team access.",
  },
  integrations: {
    href: "/integrations",
    icon: <Plug size={16} strokeWidth={1.5} />,
    label: "Integrations",
    description: "Shopify, QuickBooks, ShipStation, and more.",
  },
} as const;

function QuickJump({
  numeral,
  cards,
}: {
  numeral: string;
  cards: Array<(typeof CARD)[keyof typeof CARD]>;
}) {
  return (
    <section aria-labelledby="quick-jump">
      <SectionTitle numeral={numeral} eyebrow="Navigate" title="Quick jump" />
      <GlowCardGrid cards={cards.map((c) => ({ ...c }))} />
    </section>
  );
}
