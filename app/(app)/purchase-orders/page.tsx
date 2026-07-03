import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerButton, CornerLink } from "@/components/ui/CornerButton";
import { ChevronRight, Truck, Sparkles, Plus, Clock } from "lucide-react";
import { draftReorderPO, setAutoDraftEnabled } from "./actions";
import { PurchaseOrdersRealtime } from "@/components/realtime/PageRealtime";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getPurchaseOrdersList } from "@/lib/data/purchaseOrders";
import { createClient } from "@/lib/supabase/server";
import { ListPagination } from "@/components/ui/ListPagination";
import {
  parsePage,
  parsePageSize,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
} from "@/lib/listParams";

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
  searchParams: Promise<{
    status?: string;
    no_low_stock?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const {
    status: rawStatus,
    no_low_stock,
    page: rawPage,
    pageSize: rawPageSize,
  } = await searchParams;
  const activeFilter = FILTERS.find((f) => f.key === rawStatus) ?? FILTERS[0];
  const page = parsePage(rawPage);
  const pageSize = parsePageSize(rawPageSize);

  // Resolve scope once, then read listing + chip counts from the
  // cross-request cache (lib/data/purchaseOrders.ts). Keyed by org +
  // facility + status filter and tagged tags.purchaseOrders(orgId), so
  // navigations serve instantly and PO mutations / PurchaseOrdersRealtime
  // invalidate exactly this data.
  const scope = await getActiveScope();
  const ctx = await getCurrentOrgContext();
  const facilityId = scope.mode === "single" ? scope.id : null;

  const data = ctx
    ? await getPurchaseOrdersList(ctx.orgId, facilityId, activeFilter.statuses, {
        page,
        pageSize,
      })
    : null;

  // Workspace opt-in for the scheduled auto-draft-PO cron.
  let autoDraftEnabled = false;
  if (ctx) {
    const supabase = await createClient();
    const { data: org } = await supabase
      .from("orgs")
      .select("auto_draft_pos_enabled")
      .eq("id", ctx.orgId)
      .maybeSingle();
    autoDraftEnabled = org?.auto_draft_pos_enabled ?? false;
  }

  const pos = (data?.pos ?? []) as PoRow[];
  const total = data?.total ?? 0;
  const filteredTotal = data?.filteredTotal ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const servedPage = data?.page ?? 1;
  const servedSize = data?.pageSize ?? pageSize;
  // Rebuild the Map the chip rendering expects. The fetcher returns a plain
  // object because unstable_cache serializes its result to JSON.
  const countMap = new Map<string, number>(Object.entries(data?.counts ?? {}));

  // Chip links reset page (no ?page=) but keep a non-default page size.
  const chipHref = (key: string) => {
    const sp = new URLSearchParams();
    if (key !== "all") sp.set("status", key);
    if (servedSize !== DEFAULT_PAGE_SIZE)
      sp.set("pageSize", String(servedSize));
    const qs = sp.toString();
    return qs ? `/purchase-orders?${qs}` : "/purchase-orders";
  };

  // Everything except page/pageSize, for the pagination links.
  const paginationBaseParams: Record<string, string> = {
    ...(activeFilter.key !== "all" ? { status: activeFilter.key } : {}),
    pageSize: String(servedSize),
  };

  return (
    <div className="flex flex-col gap-32">
      <PurchaseOrdersRealtime
        warehouseId={scope.mode === "single" ? scope.id : null}
      />
      <PageHeader
        eyebrow="Flow"
        title="Purchase orders"
        description={scopeDescription(scope, {
          all: "Inbound from suppliers — drafts, in-transit, and received shipments.",
          single: (name) =>
            `Inbound from suppliers arriving at ${name} — drafts, in-transit, and received.`,
        })}
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
            <form action={setAutoDraftEnabled}>
              <input
                type="hidden"
                name="enabled"
                value={(!autoDraftEnabled).toString()}
              />
              <CornerButton
                type="submit"
                variant="ghost"
                size="sm"
                aria-pressed={autoDraftEnabled}
                title={
                  autoDraftEnabled
                    ? "Scheduled auto-drafting is on — turn off"
                    : "Turn on scheduled auto-drafting of reorder POs"
                }
              >
                <span
                  className={autoDraftEnabled ? "dot dot-live" : "dot dot-offline"}
                  aria-hidden
                />
                <Clock size={11} strokeWidth={1.5} />
                Auto-draft · {autoDraftEnabled ? "On" : "Off"}
              </CornerButton>
            </form>
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
              href={chipHref(f.key)}
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
              ? scope.mode === "single"
                ? `No purchase orders at ${scope.name}`
                : "No purchase orders yet"
              : `No ${activeFilter.label.toLowerCase()} purchase orders`
          }
          description="Place a new PO or use 'Draft from low-stock' to auto-generate one from products at or below their reorder points."
          icon={<Truck size={20} strokeWidth={1.5} />}
        />
      ) : (
        <div className="hairline bg-[var(--surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  <Th>PO</Th>
                  <Th>Supplier</Th>
                  <Th className="text-right">Items</Th>
                  <Th>Expected</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
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
                      <Td>
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
                      </Td>
                      <Td>
                        <span
                          className="text-text"
                          style={{ fontFamily: "var(--display)", fontSize: 13 }}
                        >
                          {po.supplier_name}
                        </span>
                      </Td>
                      <Td className="text-right">
                        <span
                          className="tnum text-text-secondary"
                          style={{ fontFamily: "var(--mono)", fontSize: 12 }}
                        >
                          {itemCount}
                        </span>
                      </Td>
                      <Td>
                        <span className="mono-sm text-text-secondary">
                          {expectedLabel(po.expected_date)}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={cfg.tone} variant="filled">
                          {cfg.label}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="mono-sm text-text-dim">
                          {relTime(po.created_at)}
                        </span>
                      </Td>
                      <Td>
                        <ChevronRight
                          size={12}
                          strokeWidth={1.5}
                          className="text-text-dim group-hover:text-text-muted transition-colors"
                        />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ListPagination
            basePath="/purchase-orders"
            label="Purchase orders pagination"
            page={servedPage}
            totalPages={totalPages}
            pageSize={servedSize}
            totalCount={filteredTotal}
            shown={pos.length}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            baseParams={paginationBaseParams}
          />
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`label-text text-left px-14 py-12 font-normal ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-14 py-12 ${className}`}>{children}</td>;
}