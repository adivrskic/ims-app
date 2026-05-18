import Link from "next/link";
import {
  ClipboardList,
  Truck,
  RotateCcw,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";

interface Props {
  /** When set, scopes Orders / POs / Returns queries to a single facility. */
  warehouseId?: string | null;
}

/**
 * Operations Today
 * ────────────────
 * Today's actionable work, as four signal cards. Each card is a clickable
 * drill-down into the matching list view.
 *
 * P3: takes an optional warehouseId. When set, the Orders/POs/Returns counts
 * scope to that facility and the drill-down links carry the filter through.
 * Low-stock count stays org-wide because it comes from inventory_snapshots
 * (which is org-wide for now — would need per-facility snapshots to scope).
 */
export async function OperationsToday({ warehouseId }: Props) {
  const supabase = await createClient();

  const now = new Date();
  const todayISO = new Date(now);
  todayISO.setHours(23, 59, 59, 999);
  const inSevenDays = new Date(now);
  inSevenDays.setDate(now.getDate() + 7);
  inSevenDays.setHours(23, 59, 59, 999);
  const todayDate = now.toISOString().slice(0, 10);

  // Build scope-aware queries
  let ordersQuery = supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("status", [
      "created",
      "pick_list_assigned",
      "in_progress",
      "staged",
      "ready",
    ])
    .lte("delivery_date", todayISO.toISOString());
  if (warehouseId) ordersQuery = ordersQuery.eq("warehouse_id", warehouseId);

  let poQuery = supabase
    .from("purchase_orders")
    .select("id", { count: "exact", head: true })
    .in("status", ["sent", "partially_received"])
    .lte("expected_date", inSevenDays.toISOString());
  if (warehouseId) poQuery = poQuery.eq("warehouse_id", warehouseId);

  let returnsQuery = supabase
    .from("returns")
    .select("id", { count: "exact", head: true })
    .is("reviewed_at", null);
  if (warehouseId) returnsQuery = returnsQuery.eq("warehouse_id", warehouseId);

  const [
    { count: ordersToPick },
    { count: posArriving },
    { count: returnsPending },
    { data: latestSnapshot },
  ] = await Promise.all([
    ordersQuery,
    poQuery,
    returnsQuery,
    supabase
      .from("inventory_snapshots")
      .select("low_stock_count, snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lowStock =
    (latestSnapshot as {
      low_stock_count: number;
      snapshot_date: string;
    } | null) ?? null;
  const snapshotIsToday = lowStock?.snapshot_date === todayDate;

  // Build drill-down hrefs with scope when applicable
  const ordersHref = warehouseId
    ? `/orders?warehouse=${warehouseId}`
    : "/orders";
  const posHref = warehouseId
    ? `/purchase-orders?warehouse=${warehouseId}`
    : "/purchase-orders";
  const returnsHref = warehouseId
    ? `/returns?warehouse=${warehouseId}`
    : "/returns";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-12">
      <OpsCard
        href={ordersHref}
        icon={<ClipboardList size={14} strokeWidth={1.5} />}
        label="Orders to pick"
        count={ordersToPick ?? 0}
        caption={
          (ordersToPick ?? 0) === 0
            ? "Nothing scheduled"
            : "Delivery due today or overdue"
        }
        tone={(ordersToPick ?? 0) > 0 ? "warning" : "neutral"}
      />
      <OpsCard
        href={posHref}
        icon={<Truck size={14} strokeWidth={1.5} />}
        label="POs arriving"
        count={posArriving ?? 0}
        caption={
          (posArriving ?? 0) === 0
            ? "None in transit"
            : "Within the next 7 days"
        }
        tone="neutral"
      />
      <OpsCard
        href={returnsHref}
        icon={<RotateCcw size={14} strokeWidth={1.5} />}
        label="Returns to review"
        count={returnsPending ?? 0}
        caption={
          (returnsPending ?? 0) === 0
            ? "All dispositioned"
            : "Awaiting disposition"
        }
        tone={(returnsPending ?? 0) > 0 ? "warning" : "neutral"}
      />
      <OpsCard
        href="/inventory?low_stock=1"
        icon={<AlertTriangle size={14} strokeWidth={1.5} />}
        label="Low-stock SKUs"
        count={lowStock?.low_stock_count ?? 0}
        caption={
          !lowStock
            ? "No snapshot yet"
            : snapshotIsToday
            ? "At or below reorder point"
            : `As of ${lowStock.snapshot_date}`
        }
        tone={(lowStock?.low_stock_count ?? 0) > 0 ? "danger" : "neutral"}
      />
    </div>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────────

type Tone = "neutral" | "warning" | "danger";

function OpsCard({
  href,
  icon,
  label,
  count,
  caption,
  tone,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  count: number;
  caption: string;
  tone: Tone;
}) {
  const accent =
    tone === "danger"
      ? "text-[var(--danger)]"
      : tone === "warning"
      ? "text-[var(--warning)]"
      : "text-text";

  const iconBg =
    tone === "danger"
      ? "bg-[var(--danger-dim)] text-[var(--danger)]"
      : tone === "warning"
      ? "bg-[var(--warning-dim)] text-[var(--warning)]"
      : "bg-[var(--accent-dim)] text-[var(--accent)]";

  return (
    <Link
      href={href}
      className="hairline bg-[var(--surface)] p-16 flex flex-col gap-12 row-interactive group transition-colors"
    >
      <div className="flex items-start justify-between gap-12">
        <span
          className={`w-26 h-26 hairline-subtle flex items-center justify-center shrink-0 ${iconBg}`}
          aria-hidden
        >
          {icon}
        </span>
        <ArrowRight
          size={12}
          strokeWidth={1.5}
          className="text-text-dim group-hover:text-[var(--accent)] transition-colors"
        />
      </div>

      <div className="flex flex-col gap-4">
        <p className="label-text">{label}</p>
        <p
          className={`tnum ${accent}`}
          style={{
            fontFamily: "var(--display)",
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "-0.4px",
            lineHeight: 1.05,
          }}
        >
          {count.toLocaleString()}
        </p>
        <p className="mono-sm text-text-muted">{caption}</p>
      </div>
    </Link>
  );
}
