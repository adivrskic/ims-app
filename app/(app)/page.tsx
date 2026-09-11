import { PageHeader } from "@/components/ui/PageHeader";
import { GlowKpiGrid, type GlowKpi } from "@/components/dashboard/GlowKpiGrid";
import { formatCurrency } from "@/lib/dashboard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerLink } from "@/components/ui/CornerButton";
import { GlowCardGrid } from "@/components/dashboard/GlowCardGrid";
import { ReorderAlerts } from "@/components/dashboard/ReorderAlerts";
import {
  GettingStarted,
  type GettingStartedItem,
} from "@/components/dashboard/GettingStarted";
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
import {
  getCurrentOrgContext,
  getActiveMembership,
  getProfile,
} from "@/lib/data/user";
import {
  getOverviewData,
  TREND_DAYS,
  type OverviewData,
} from "@/lib/data/overview";
import { getKioskData, type KioskData } from "@/lib/data/kiosk";
import {
  resolveDashboard,
  type DashboardBlock,
  type DashboardRole,
  type KpiKey,
  type SectionKey,
  type CardKey,
} from "@/lib/dashboardWidgets";
import { ALWAYS_ON_MODULES } from "@/lib/modules";
import { getSuppliers } from "@/lib/data/org";
import { sampleCounts } from "@/lib/sampleData/types";
import { SampleDataBanner } from "@/components/dashboard/SampleDataBanner";
import { SampleDataOffer } from "@/components/dashboard/SampleDataControls";
import type { ReactNode } from "react";
import type { Permission } from "@/lib/permissions";

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

/* bucketByDay used to live here, folding 14 days of raw scan rows into buckets.
   app.overview_scan_trend does it in Postgres now — see lib/data/overview.ts. */

const flat = (n: number) => new Array(TREND_DAYS).fill(n);

/**
 * Real KPI history when the nightly snapshots have accrued ≥2 points
 * (appending today's live value so the spark ends at "now"); flat
 * placeholder otherwise.
 */
const sparkOr = (series: number[], live: number): number[] =>
  series.length >= 2 ? [...series, live] : flat(live);

/**
 * Delta chip vs ~7 days ago from snapshot history. Null until enough
 * history exists or when nothing changed.
 */
function deltaVs7d(
  series: number[],
  live: number,
  format: (n: number) => string,
  { downIsGood = false }: { downIsGood?: boolean } = {}
): { value: string; direction: "up" | "down"; tone: "good" | "bad" | "neutral" } | null {
  if (series.length < 2) return null;
  const base = series[Math.max(0, series.length - 7)];
  const diff = live - base;
  if (diff === 0) return null;
  const direction = diff > 0 ? "up" : "down";
  const improved = downIsGood ? diff < 0 : diff > 0;
  return {
    value: `${diff > 0 ? "+" : "−"}${format(Math.abs(diff))} · 7d`,
    direction,
    tone: improved ? "good" : "bad",
  };
}

/* ── View model shared across every widget ─────────────────────────────── */

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
  // True totals for the capped lists — KPI tiles must use these, never
  // list.length (the lists fetch at most 8 rows).
  pickQueueCount: number;
  posInTransitCount: number;
  lowStockCount: number;
  // financial signals (getOverviewData → app.overview_financials)
  inventoryValue: number;
  deadStockValue: number;
  deadStockSkus: number;
  // nightly KPI history (app.kpi_snapshots via getOverviewData)
  history: OverviewData["history"];
}

export default async function OverviewPage() {
  const scope = await getActiveScope();
  const [ctx, membership, profile] = await Promise.all([
    getCurrentOrgContext(),
    getActiveMembership(),
    getProfile(),
  ]);
  const role: DashboardRole = (ctx?.role as DashboardRole) ?? "member";

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
  const recentScans = (data?.recentScans ?? []) as OverviewVM["recentScans"];

  // Aggregated in Postgres — see lib/data/overview.ts. The low-stock list
  // arrives already filtered to on_hand <= reorder_point, sorted by deepest
  // shortfall, and capped; the trend arrives zero-filled per day.
  const lowStock = data?.lowStock ?? [];
  const totalStock = data?.totalStock ?? 0;
  const trend = data?.trend ?? new Array<number>(TREND_DAYS).fill(0);
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
    pickQueueCount: kiosk?.pickQueueCount ?? 0,
    posInTransitCount: kiosk?.posInTransitCount ?? 0,
    /* Both sources agree on the "low" rule (available stock, excluding
       quarantined units) as of 20260814140000; kiosk wins only because it is
       already loaded. The fallback is the RPC's window-functioned total. */
    lowStockCount: kiosk?.lowStockCount ?? data?.lowStockCount ?? 0,
    inventoryValue: data?.financials.inventoryValue ?? 0,
    deadStockValue: data?.financials.deadStockValue ?? 0,
    deadStockSkus: data?.financials.deadStockSkus ?? 0,
    history: data?.history ?? {
      dates: [],
      inventoryValue: [],
      unitsOnHand: [],
      lowStock: [],
      openOrders: [],
    },
  };

  // ── Choice-driven layout ──────────────────────────────────────────────
  // The onboarding wizard's answers persist on the org; the resolver turns
  // them into an ordered block list. Null modules = the classic layout.
  const org = membership?.org ?? null;
  const enabledModules = org?.enabled_modules ?? null;
  const priorities = org?.priorities ?? null;
  const compact = org?.onboarding?.size_class === "single_room";
  const moduleSet = enabledModules
    ? new Set([...enabledModules, ...ALWAYS_ON_MODULES])
    : null;
  const hasModule = (m: string) => !moduleSet || moduleSet.has(m);

  // Sample data (if loaded) must not count as "started": the checklist and
  // its done-states are judged on what the customer added themselves, so the
  // sample rows are subtracted from every count they touch.
  const sample = org?.sample_data ?? null;
  const sampleN = sampleCounts(sample);
  const own = (total: number, sampled: number) => Math.max(0, total - sampled);
  const supplierCount = ctx ? (await getSuppliers(ctx.orgId)).length : 0;
  const ownVm: OverviewVM = {
    ...vm,
    productCount: own(vm.productCount, sampleN.products),
    sectionCount: own(vm.sectionCount, sampleN.sections),
    scansTodayCount: 0,
    totalScans14: own(vm.totalScans14, sampleN.scansInWindow),
    openOrdersCount: own(vm.openOrdersCount, sampleN.orders),
  };
  const canManageSample =
    Boolean(ctx) && ctx!.role !== "member" && ctx!.can("inventory.manage");
  const sampleOffer: ReactNode =
    !sample && canManageSample && warehouseCount > 0 ? <SampleDataOffer /> : null;

  const dismissed =
    profile?.dashboard_prefs?.dismissed_getting_started === true;
  // "Not started yet" = no products of their own in the catalog. Once a
  // workspace has products it's operating, so the checklist retires itself
  // (and it's always manually dismissible before then).
  const youngWorkspace = ownVm.productCount === 0;
  const checklist =
    !dismissed && youngWorkspace && ctx
      ? buildChecklist(ownVm, hasModule, (p) => ctx.can(p), {
          supplierCount: own(supplierCount, sampleN.suppliers),
        })
      : [];

  let blocks = resolveDashboard(role, enabledModules, priorities, { compact });
  blocks = blocks.filter((b) => {
    // The reorder worklist still self-hides when nothing is below threshold —
    // filtered here, BEFORE numbering, so the numeral sequence has no gaps.
    if (b.kind === "section" && b.key === "section.reorder_alerts") {
      return vm.lowStock.length > 0;
    }
    if (b.kind === "columns") return true;
    if (b.kind === "section" && b.key === "section.getting_started") {
      return checklist.length > 0;
    }
    return true;
  });

  // Numerals derive from actual render order. Columns hold two titled
  // sections side by side, so they consume two numerals (as before).
  let numeralCounter = 0;
  const nextNumeral = () => String(++numeralCounter).padStart(2, "0");

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
      {sample && <SampleDataBanner marker={sample} canClear={canManageSample} />}

      {blocks.map((block, i) => (
        <Block
          key={blockKey(block, i)}
          block={block}
          vm={vm}
          role={role}
          checklist={checklist}
          sampleOffer={sampleOffer}
          nextNumeral={nextNumeral}
        />
      ))}
    </PageHeader>
  );
}

function blockKey(block: DashboardBlock, i: number): string {
  if (block.kind === "kpis") return block.id;
  if (block.kind === "section") return block.key;
  if (block.kind === "columns") return block.keys.join("+");
  return `quick_jump-${i}`;
}

/* ════════════════════════════════════════════════════════════════════════
 * Block renderer
 * ════════════════════════════════════════════════════════════════════════ */

function Block({
  block,
  vm,
  role,
  checklist,
  sampleOffer,
  nextNumeral,
}: {
  block: DashboardBlock;
  vm: OverviewVM;
  role: DashboardRole;
  checklist: GettingStartedItem[];
  sampleOffer: ReactNode;
  nextNumeral: () => string;
}) {
  if (block.kind === "kpis") {
    const kpis = block.kpis.map((k) => buildKpi(k, vm, role));
    if (block.title) {
      return (
        <section aria-labelledby={block.id}>
          <SectionTitle
            numeral={nextNumeral()}
            eyebrow={block.title.eyebrow}
            title={block.title.title}
          />
          <GlowKpiGrid kpis={kpis} />
        </section>
      );
    }
    return (
      <section aria-labelledby={block.id}>
        <h2 id={block.id} className="sr-only">
          {block.srTitle ?? "Signals"}
        </h2>
        <GlowKpiGrid kpis={kpis} />
      </section>
    );
  }

  if (block.kind === "columns") {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-32">
        {block.keys.map((key) => (
          <Section
            key={key}
            sectionKey={key}
            vm={vm}
            checklist={checklist}
            sampleOffer={sampleOffer}
            numeral={nextNumeral()}
          />
        ))}
      </div>
    );
  }

  if (block.kind === "quick_jump") {
    return <QuickJump numeral={nextNumeral()} cards={block.cards} />;
  }

  return (
    <Section
      sectionKey={block.key}
      vm={vm}
      checklist={checklist}
      sampleOffer={sampleOffer}
      numeral={nextNumeral()}
    />
  );
}

function Section({
  sectionKey,
  vm,
  checklist,
  sampleOffer,
  numeral,
}: {
  sectionKey: SectionKey;
  vm: OverviewVM;
  checklist: GettingStartedItem[];
  sampleOffer: ReactNode;
  numeral: string;
}) {
  switch (sectionKey) {
    case "section.getting_started":
      return (
        <GettingStarted
          numeral={numeral}
          items={checklist}
          footer={sampleOffer}
        />
      );
    case "section.reorder_alerts":
      return <ReorderSection vm={vm} numeral={numeral} />;
    case "section.pick_queue":
      return <PickQueueSection pickQueue={vm.pickQueue} numeral={numeral} />;
    case "section.pos_in_transit":
      return <PoSection posInTransit={vm.posInTransit} numeral={numeral} />;
    case "section.top_movers":
      return <MoversSection topMovers={vm.topMovers} numeral={numeral} />;
    case "section.recent_scans":
      return <RecentScansSection vm={vm} numeral={numeral} />;
    default:
      return null;
  }
}

/* ── KPI factory ───────────────────────────────────────────────────────── */

function buildKpi(key: KpiKey, vm: OverviewVM, role: DashboardRole): GlowKpi {
  switch (key) {
    case "kpi.scans_today":
      return {
        label: role === "owner" ? "Scan velocity · today" : "Scans · today",
        value: vm.scansTodayCount.toLocaleString(),
        spark: vm.trend,
        delta: {
          value: `${vm.totalScans14.toLocaleString()} in 14d`,
          direction: vm.scansTodayCount > 0 ? "up" : "flat",
          tone: "neutral",
        },
      };
    case "kpi.open_orders":
      return {
        label: "Open orders",
        value: vm.openOrdersCount.toLocaleString(),
        spark: sparkOr(vm.history.openOrders, vm.openOrdersCount),
      };
    case "kpi.pick_queue":
      return {
        label: "In pick queue",
        value: vm.pickQueueCount.toLocaleString(),
        spark: flat(vm.pickQueueCount),
      };
    case "kpi.pos_in_transit":
      return {
        label: "POs in transit",
        value: vm.posInTransitCount.toLocaleString(),
        spark: flat(vm.posInTransitCount),
      };
    case "kpi.low_stock":
      return {
        label: "Low stock",
        value: vm.lowStockCount.toLocaleString(),
        spark: sparkOr(vm.history.lowStock, vm.lowStockCount),
        delta:
          vm.productCount === 0
            ? { value: "No products yet", direction: "flat", tone: "neutral" }
            : {
                value: vm.lowStockCount > 0 ? "Needs reorder" : "All stocked",
                direction: vm.lowStockCount > 0 ? "down" : "flat",
                tone: vm.lowStockCount > 0 ? "bad" : "good",
              },
      };
    case "kpi.units_on_hand":
      return {
        label: "Units on hand",
        value: vm.totalStock.toLocaleString(),
        spark: sparkOr(vm.history.unitsOnHand, vm.totalStock),
      };
    case "kpi.products":
      return {
        label: "Products",
        value: vm.productCount.toLocaleString(),
        spark: flat(vm.productCount),
      };
    case "kpi.sections":
      return {
        label: vm.scope.mode === "single" ? "Sections here" : "Sections",
        value: vm.sectionCount.toLocaleString(),
        spark: flat(vm.sectionCount),
      };
    case "kpi.inventory_value":
      return {
        label: "Inventory value",
        value: formatCurrency(vm.inventoryValue),
        spark: sparkOr(vm.history.inventoryValue, vm.inventoryValue),
        delta:
          vm.inventoryValue === 0
            ? { value: "Set unit costs", direction: "flat", tone: "neutral" }
            : deltaVs7d(
                vm.history.inventoryValue,
                vm.inventoryValue,
                formatCurrency
              ) ?? undefined,
      };
    case "kpi.dead_stock":
      return {
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
      };
  }
}

/* ── Getting-started checklist composition ─────────────────────────────── */

/**
 * Compose the first-run checklist from the org's enabled modules AND the
 * viewer's permissions — a day-0 member must never get a card whose page
 * 403s. Done-states derive from counts already in the view model.
 */
function buildChecklist(
  vm: OverviewVM,
  hasModule: (m: string) => boolean,
  can: (permission: Permission) => boolean,
  opts: { supplierCount: number }
): GettingStartedItem[] {
  const items: GettingStartedItem[] = [];

  if (can("inventory.manage")) {
    items.push({
      key: "product",
      label: "Add your first product",
      desc: "Register one item to start tracking stock",
      href: "/inventory",
      done: vm.productCount > 0,
    });
    if (vm.productCount === 0) {
      items.push({
        key: "import",
        label: "…or import your whole catalog",
        desc: "Upload a CSV — template included",
        href: "/inventory/import",
      });
    }
  }
  if (can("facilities.manage")) {
    items.push({
      key: "layout",
      label: "Lay out your space",
      desc: "Sections and bays make putaway and picking fast",
      href: "/facilities",
      done: vm.sectionCount > 0,
    });
  }
  if (hasModule("purchase-orders") && can("purchasing.manage")) {
    // A PO needs a supplier; sending a day-0 owner to a form that can only
    // say "add a supplier first" is a dead end, so start where they can act.
    if (opts.supplierCount === 0 && can("suppliers.manage")) {
      items.push({
        key: "supplier",
        label: "Add your first supplier",
        desc: "Who you buy from — then receive a purchase order from them",
        href: "/suppliers/new",
      });
    } else {
      items.push({
        key: "po",
        label: "Receive your first purchase order",
        desc: "Bring stock in the front door",
        href: "/purchase-orders/new",
      });
    }
  }
  if (hasModule("orders") && can("orders.manage")) {
    items.push({
      key: "order",
      label: "Create an order",
      desc: "Pick, stage, and ship your first outbound",
      href: "/orders/new",
      done: vm.openOrdersCount > 0,
    });
  }
  items.push({
    key: "scan",
    label: "Count what you have",
    desc: "Scan or count anything — it keeps on-hand honest",
    href: "/scan",
    done: vm.scansTodayCount > 0 || vm.totalScans14 > 0,
  });
  if (can("members.manage")) {
    items.push({
      key: "team",
      label: "Invite your team",
      desc: "Teammates join as members with a personal link",
      href: "/settings/members",
    });
  }
  if (hasModule("integrations") && can("integrations.manage")) {
    items.push({
      key: "integrations",
      label: "Connect your store",
      desc: "Shopify, QuickBooks, ShipStation and more",
      href: "/integrations",
    });
  }

  // 8 is the maximum this function can produce (the "import" item only
  // appears while productCount === 0, which is the only time the checklist
  // renders at all). Slicing at 7 silently dropped "Connect your store"
  // every time for a fully-enabled workspace.
  return items.slice(0, 8);
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
          action={
            <CornerLink href="/orders/new" variant="ghost" size="sm">
              New order →
            </CornerLink>
          }
        />
      ) : (
        <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
          {pickQueue.slice(0, 6).map((o, i) => (
            <li key={o.order_number ?? i} className="px-20 py-12 flex items-center gap-14">
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
          action={
            <CornerLink href="/purchase-orders/new" variant="ghost" size="sm">
              New purchase order →
            </CornerLink>
          }
        />
      ) : (
        <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
          {posInTransit.slice(0, 6).map((po, i) => (
            <li key={po.po_number ?? i} className="px-20 py-12 flex items-center gap-14">
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
          action={
            <CornerLink href="/scan" variant="ghost" size="sm">
              Open the scanner →
            </CornerLink>
          }
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
          action={
            <CornerLink href="/scan" variant="ghost" size="sm">
              Open the scanner →
            </CornerLink>
          }
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

const CARD: Record<
  CardKey,
  {
    href: string;
    icon: React.ReactNode;
    label: string;
    description: string;
  }
> = {
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
};

function QuickJump({ numeral, cards }: { numeral: string; cards: CardKey[] }) {
  return (
    <section aria-labelledby="quick-jump">
      <SectionTitle numeral={numeral} eyebrow="Navigate" title="Quick jump" />
      <GlowCardGrid cards={cards.map((c) => ({ ...CARD[c] }))} />
    </section>
  );
}
