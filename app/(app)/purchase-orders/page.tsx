import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerButton, CornerLink } from "@/components/ui/CornerButton";
import { ChevronRight, Truck, Sparkles, Plus } from "lucide-react";
import { draftReorderPO } from "./actions";

export const metadata = { title: "Purchase Orders" };

type PoStatus =
  | "draft"
  | "sent"
  | "partially_received"
  | "fully_received"
  | "cancelled";

interface PoRow {
  id: string;
  po_number: string;
  supplier_name: string;
  status: PoStatus;
  expected_date: string | null;
  created_at: string | null;
  items: Array<{ count: number }> | { count: number } | null;
}

const STATUS_CONFIG: Record<
  PoStatus,
  { label: string; tone: "neutral" | "info" | "warning" | "success" }
> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  partially_received: { label: "Partial", tone: "warning" },
  fully_received: { label: "Received", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const FILTERS: Array<{
  key: string;
  label: string;
  statuses: PoStatus[] | null;
}> = [
  { key: "all", label: "All", statuses: null },
  { key: "draft", label: "Draft", statuses: ["draft"] },
  { key: "sent", label: "Sent", statuses: ["sent"] },
  { key: "partial", label: "Partial", statuses: ["partially_received"] },
  { key: "received", label: "Received", statuses: ["fully_received"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d < 1) return "Today";
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function expectedLabel(date: string | null): string {
  if (!date) return "TBD";
  const d = new Date(date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 0 && diff < 7) return `In ${diff}d`;
  if (diff < 0) return `${-diff}d overdue`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; no_low_stock?: string }>;
}) {
  const { status: rawStatus, no_low_stock } = await searchParams;
  const activeFilter = FILTERS.find((f) => f.key === rawStatus) ?? FILTERS[0];

  const supabase = await createClient();

  let query = supabase
    .from("purchase_orders")
    .select(
      "id, po_number, supplier_name, status, expected_date, created_at, items:po_line_items ( count )"
    )
    .order("created_at", { ascending: false });

  if (activeFilter.statuses) {
    query = query.in("status", activeFilter.statuses);
  }

  const { data } = await query;
  const pos = (data ?? []) as PoRow[];

  const { data: allStatuses } = await supabase
    .from("purchase_orders")
    .select("status");
  const countMap = new Map<string, number>();
  let total = 0;
  for (const r of (allStatuses ?? []) as Array<{ status: PoStatus }>) {
    countMap.set(r.status, (countMap.get(r.status) ?? 0) + 1);
    total++;
  }

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Flow"
        title="Purchase orders"
        description="Inbound from suppliers — drafts, in-transit, and received shipments."
        meta={[
          { label: "Total", value: total },
          {
            label: "Open",
            value:
              (countMap.get("draft") ?? 0) +
              (countMap.get("sent") ?? 0) +
              (countMap.get("partially_received") ?? 0),
            status: "live" as const,
          },
        ]}
        actions={
          <div className="flex items-center gap-10">
            <form action={draftReorderPO}>
              <CornerButton type="submit" variant="ghost" size="sm">
                <Sparkles size={11} strokeWidth={1.5} />
                Draft from low-stock
              </CornerButton>
            </form>
            <CornerLink href="/purchase-orders/new" variant="primary" size="sm">
              <Plus size={11} strokeWidth={1.5} />
              New PO
            </CornerLink>
          </div>
        }
      />

      {no_low_stock === "1" && (
        <div className="hairline-subtle bg-[var(--surface-2)] px-16 py-12 flex items-center gap-10">
          <span className="dot dot-online" aria-hidden />
          <p className="mono-sm text-text-secondary">
            All SKUs are at or above their reorder points — no PO drafted.
          </p>
        </div>
      )}

      <nav
        className="flex items-center gap-2 hairline-b overflow-x-auto"
        aria-label="Filter by status"
      >
        {FILTERS.map((f) => {
          const isActive = f.key === activeFilter.key;
          const chipCount = f.statuses
            ? f.statuses.reduce((sum, s) => sum + (countMap.get(s) ?? 0), 0)
            : total;
          return (
            <Link
              key={f.key}
              href={
                f.key === "all"
                  ? "/purchase-orders"
                  : `/purchase-orders?status=${f.key}`
              }
              className={`relative px-12 py-10 transition-colors whitespace-nowrap flex items-center gap-8 ${
                isActive
                  ? "text-[var(--accent)]"
                  : "text-text-muted hover:text-text"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="label-text">{f.label}</span>
              <span
                className={`tnum ${
                  isActive ? "text-[var(--accent)]" : "text-text-dim"
                }`}
                style={{ fontFamily: "var(--mono)", fontSize: 10 }}
              >
                {chipCount}
              </span>
              {isActive && (
                <span
                  className="absolute left-0 right-0 bottom-0 h-px bg-[var(--accent)]"
                  aria-hidden
                  style={{ bottom: -1 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {pos.length === 0 ? (
        <EmptyState
          title={
            activeFilter.key === "all"
              ? "No purchase orders yet"
              : `No ${activeFilter.label.toLowerCase()} POs`
          }
          description="Drafts are created from the low-stock signal or imported from QuickBooks. Sent POs track receipts inline as shipments arrive."
          icon={<Truck size={20} strokeWidth={1.5} />}
        />
      ) : (
        <div className="hairline bg-[var(--surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  <th
                    className="text-left px-16 py-10 label-text text-text-muted"
                    scope="col"
                  >
                    PO
                  </th>
                  <th
                    className="text-left px-16 py-10 label-text text-text-muted"
                    scope="col"
                  >
                    Supplier
                  </th>
                  <th
                    className="text-right px-16 py-10 label-text text-text-muted"
                    scope="col"
                  >
                    SKUs
                  </th>
                  <th
                    className="text-left px-16 py-10 label-text text-text-muted"
                    scope="col"
                  >
                    Expected
                  </th>
                  <th
                    className="text-left px-16 py-10 label-text text-text-muted"
                    scope="col"
                  >
                    Status
                  </th>
                  <th
                    className="text-left px-16 py-10 label-text text-text-muted"
                    scope="col"
                  >
                    Created
                  </th>
                  <th aria-hidden style={{ width: 28 }} />
                </tr>
              </thead>
              <tbody>
                {pos.map((po) => {
                  const items = Array.isArray(po.items)
                    ? po.items[0]
                    : po.items;
                  const itemCount = items?.count ?? 0;
                  const cfg = STATUS_CONFIG[po.status];
                  return (
                    <tr
                      key={po.id}
                      className="hairline-b row-interactive group"
                    >
                      <td className="px-16 py-12">
                        <Link
                          href={`/purchase-orders/${po.id}`}
                          className="text-text group-hover:text-[var(--accent)] transition-colors"
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                        >
                          {po.po_number}
                        </Link>
                      </td>
                      <td className="px-16 py-12">
                        <Link
                          href={`/purchase-orders/${po.id}`}
                          className="text-text"
                          style={{ fontFamily: "var(--display)", fontSize: 13 }}
                        >
                          {po.supplier_name}
                        </Link>
                      </td>
                      <td className="px-16 py-12 text-right">
                        <span className="mono-body text-text tnum">
                          {itemCount}
                        </span>
                      </td>
                      <td className="px-16 py-12">
                        <span className="mono-sm text-text-secondary">
                          {expectedLabel(po.expected_date)}
                        </span>
                      </td>
                      <td className="px-16 py-12">
                        <Badge tone={cfg.tone} variant="filled">
                          {cfg.label}
                        </Badge>
                      </td>
                      <td className="px-16 py-12">
                        <span className="mono-sm text-text-dim">
                          {relTime(po.created_at)}
                        </span>
                      </td>
                      <td className="px-16 py-12">
                        <Link
                          href={`/purchase-orders/${po.id}`}
                          className="block text-text-dim group-hover:text-[var(--accent)] transition-colors"
                          aria-label={`Open PO ${po.po_number}`}
                        >
                          <ChevronRight size={12} strokeWidth={1.5} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
