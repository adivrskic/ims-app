import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getActiveScope } from "@/lib/facilityScope";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerLink } from "@/components/ui/CornerButton";
import { LocalTime } from "@/components/ui/LocalTime";
import { ListPagination } from "@/components/ui/ListPagination";
import { Th, Td } from "@/components/ui/Table";
import {
  parsePage,
  parsePageSize,
  PAGE_SIZE_OPTIONS,
} from "@/lib/listParams";
import { ArrowLeftRight, ArrowRight, Plus, ChevronRight } from "lucide-react";

export const metadata = { title: "Transfers" };

type OrderStatus =
  | "created"
  | "pick_list_assigned"
  | "in_progress"
  | "staged"
  | "ready"
  | "out_for_delivery"
  | "complete"
  | "cancelled";

// Transfer-friendly status mapping over the shared order lifecycle.
const TRANSFER_STATUS: Record<
  OrderStatus,
  { label: string; tone: "neutral" | "info" | "warning" | "success"; live?: boolean }
> = {
  created: { label: "Preparing", tone: "neutral" },
  pick_list_assigned: { label: "Preparing", tone: "info" },
  in_progress: { label: "Picking", tone: "info" },
  staged: { label: "Staged", tone: "info" },
  ready: { label: "Ready to ship", tone: "warning" },
  out_for_delivery: { label: "In transit", tone: "warning", live: true },
  complete: { label: "Received", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}
export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const { page: rawPage, pageSize: rawPageSize } = await searchParams;
  const page = parsePage(rawPage);
  const pageSize = parsePageSize(rawPageSize);

  const [ctx, scope] = await Promise.all([
    getCurrentOrgContext(),
    getActiveScope(),
  ]);
  if (!ctx) {
    return <PageHeader eyebrow="Flow" title="Transfers" description="No workspace." />;
  }
  const supabase = await createClient();

  // Honour the active facility like every other list. A transfer has two ends,
  // so "at this facility" means either end — scoping on the source alone would
  // hide everything inbound, which is the half you most need to see.
  const scopeFilter =
    scope.mode === "single"
      ? `warehouse_id.eq.${scope.id},destination_warehouse_id.eq.${scope.id}`
      : null;

  // One page window with an exact total (the list used to stop silently at
  // PostgREST's 1,000-row cap), plus head counts for the header so the
  // numbers cover every transfer, not just the visible page.
  const pageCall = (offset: number) => {
    let q = supabase
      .from("orders")
      .select(
        `id, order_number, status, created_at,
         source:warehouses!orders_warehouse_id_fkey ( name ),
         dest:warehouses!orders_destination_warehouse_id_fkey ( name ),
         items:order_items ( count )`,
        { count: "exact" }
      )
      .eq("org_id", ctx.orgId)
      .eq("order_type", "internal_transfer");
    if (scopeFilter) q = q.or(scopeFilter);
    return q
      .order("created_at", { ascending: false })
      .order("id", { ascending: true }) // stable tiebreak across pages
      .range(offset, offset + pageSize - 1);
  };
  const headCount = () => {
    let q = supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("order_type", "internal_transfer");
    if (scopeFilter) q = q.or(scopeFilter);
    return q;
  };

  const [
    { data, count },
    { count: inTransitRaw },
    { count: openRaw },
  ] = await Promise.all([
    pageCall((page - 1) * pageSize),
    headCount().eq("status", "out_for_delivery"),
    headCount().not("status", "in", "(complete,cancelled)"),
  ]);

  type Row = {
    id: string;
    order_number: string;
    status: OrderStatus;
    created_at: string | null;
    source: { name: string } | { name: string }[] | null;
    dest: { name: string } | { name: string }[] | null;
    items: Array<{ count: number }> | { count: number } | null;
  };
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // If a stale ?page= overshot, re-fetch the last valid page.
  let transfers = (data ?? []) as Row[];
  let servedPage = page;
  if (transfers.length === 0 && totalCount > 0 && page > totalPages) {
    servedPage = totalPages;
    const retry = await pageCall((servedPage - 1) * pageSize);
    transfers = (retry.data ?? []) as Row[];
  }
  const inTransit = inTransitRaw ?? 0;
  const open = openRaw ?? 0;

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Flow"
        title="Transfers"
        description="Move stock between facilities. Each transfer is created at a source, ships in-transit, and is received at its destination."
        meta={[
          { label: "Open", value: open },
          {
            label: "In transit",
            value: inTransit,
            status: inTransit > 0 ? "alert" : undefined,
          },
        ]}
        actions={
          <CornerLink
            href="/orders/new?type=internal_transfer"
            variant="primary"
            size="sm"
          >
            <Plus size={11} strokeWidth={1.5} />
            New transfer
          </CornerLink>
        }
      />

      {totalCount === 0 ? (
        <EmptyState
          title="No transfers yet"
          description="Create a transfer to move stock from one facility to another. It'll show its source, destination, and in-transit status here."
          icon={<ArrowLeftRight size={20} strokeWidth={1.5} />}
        />
      ) : (
        <div className="hairline bg-[var(--surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table
              className="w-full"
              style={{ borderCollapse: "collapse" }}
              aria-label="Transfers"
            >
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  <Th>Transfer</Th>
                  <Th>Route</Th>
                  <Th align="right">Items</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                  <th aria-hidden style={{ width: 28 }} />
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => {
                  const items = firstOf(t.items);
                  const cfg = TRANSFER_STATUS[t.status];
                  const src = firstOf(t.source)?.name ?? "—";
                  const dst = firstOf(t.dest)?.name ?? "—";
                  return (
                    <tr key={t.id} className="hairline-b row-interactive group">
                      <Td>
                        <Link
                          href={`/orders/${t.id}`}
                          className="text-text group-hover:text-[var(--accent)] transition-colors"
                          style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 500 }}
                        >
                          {t.order_number}
                        </Link>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-8">
                          <span
                            className="text-text-secondary"
                            style={{ fontFamily: "var(--display)", fontSize: 13 }}
                          >
                            {src}
                          </span>
                          <ArrowRight
                            size={11}
                            strokeWidth={1.5}
                            className="text-text-dim shrink-0"
                            aria-label="to"
                          />
                          <span
                            className="text-text"
                            style={{ fontFamily: "var(--display)", fontSize: 13 }}
                          >
                            {dst}
                          </span>
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="tnum text-text-secondary" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                          {items?.count ?? 0}
                        </span>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-6">
                          {cfg.live && <span className="dot dot-live" aria-hidden />}
                          <Badge tone={cfg.tone} variant="filled">
                            {cfg.label}
                          </Badge>
                        </span>
                      </Td>
                      <Td>
                        <LocalTime
                          iso={t.created_at}
                          format="relative"
                          className="mono-sm text-text-dim"
                        />
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
            basePath="/transfers"
            label="Transfers pagination"
            page={servedPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalCount={totalCount}
            shown={transfers.length}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            baseParams={{ pageSize: String(pageSize) }}
          />
        </div>
      )}
    </div>
  );
}

