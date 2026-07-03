import { Plus } from "lucide-react";
import { CornerLink } from "@/components/ui/CornerButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListSearchToolbar } from "@/components/ui/ListSearchToolbar";
import { ListPagination } from "@/components/ui/ListPagination";
import { SupplierList, type SupplierStatsMap } from "./SupplierList";
import { computeSupplierStats, type ScorecardPo } from "@/lib/supplier-stats";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getSuppliersPageData } from "@/lib/data/suppliers";
import {
  parsePage,
  parsePageSize,
  PAGE_SIZE_OPTIONS,
} from "@/lib/listParams";

export const metadata = { title: "Suppliers" };

interface SearchParams {
  q?: string;
  inactive?: string;
  page?: string;
  pageSize?: string;
}

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q, inactive, page: rawPage, pageSize: rawPageSize } =
    await searchParams;
  const includeInactive = inactive === "1";
  const page = parsePage(rawPage);
  const pageSize = parsePageSize(rawPageSize);

  // Search / active-filter / pagination are URL-driven and run in Postgres
  // via the cross-request cache (lib/data/suppliers.ts). The scorecard POs +
  // product counts are scoped to this page's suppliers; the grouping +
  // scorecard math below is unchanged.
  const ctx = await getCurrentOrgContext();
  const data = ctx
    ? await getSuppliersPageData(ctx.orgId, {
        q,
        includeInactive,
        page,
        pageSize,
      })
    : null;

  const suppliers = data?.suppliers ?? [];
  const pos = data?.pos ?? null;
  const productCounts = data?.productCounts ?? null;
  const totalCount = data?.totalCount ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const servedPage = data?.page ?? 1;
  const servedSize = data?.pageSize ?? pageSize;

  // Group POs by supplier, compute per-supplier scorecard.
  type RawPo = {
    id: string;
    supplier_id: string | null;
    status: ScorecardPo["status"];
    expected_date: string | null;
    sent_at: string | null;
    received_at: string | null;
    lines: Array<{
      quantity_expected: number;
      quantity_received: number | null;
      unit_cost: string | null;
      landed_unit_cost: string | null;
    }> | null;
  };
  const posBySupplier = new Map<string, ScorecardPo[]>();
  for (const raw of (pos ?? []) as RawPo[]) {
    if (!raw.supplier_id) continue;
    const sp: ScorecardPo = {
      id: raw.id,
      status: raw.status,
      expected_date: raw.expected_date,
      sent_at: raw.sent_at,
      received_at: raw.received_at,
      lines: (raw.lines ?? []).map((l) => ({
        quantity_expected: l.quantity_expected,
        quantity_received: l.quantity_received,
        unit_cost: l.unit_cost,
        landed_unit_cost: l.landed_unit_cost,
      })),
    };
    const bucket = posBySupplier.get(raw.supplier_id);
    if (bucket) bucket.push(sp);
    else posBySupplier.set(raw.supplier_id, [sp]);
  }

  // Per-supplier preferred-product count.
  const productCountMap = new Map<string, number>();
  for (const row of (productCounts ?? []) as Array<{
    preferred_supplier_id: string | null;
  }>) {
    if (!row.preferred_supplier_id) continue;
    productCountMap.set(
      row.preferred_supplier_id,
      (productCountMap.get(row.preferred_supplier_id) ?? 0) + 1
    );
  }

  // Build the stats map the list component consumes.
  const stats: SupplierStatsMap = {};
  for (const s of suppliers) {
    const supplierPos = posBySupplier.get(s.id) ?? [];
    const card = computeSupplierStats(supplierPos);
    stats[s.id] = {
      poCount: card.totalPos,
      productCount: productCountMap.get(s.id) ?? 0,
      onTimePct: card.onTimePct,
      avgLeadDays: card.avgLeadTimeDays,
    };
  }

  // Everything except page/pageSize, for the pagination links.
  const paginationBaseParams: Record<string, string> = {
    ...(q ? { q } : {}),
    ...(includeInactive ? { inactive: "1" } : {}),
    pageSize: String(servedSize),
  };

  return (
    <>
      <PageHeader
        eyebrow="Directory"
        title="Suppliers"
        description="Vendors you place purchase orders with. Tap any supplier for the full scorecard."
        meta={[{ label: "Total", value: totalCount }]}
        actions={
          <CornerLink href="/suppliers/new" variant="primary" size="sm">
            <Plus size={11} strokeWidth={1.5} />
            New supplier
          </CornerLink>
        }
      />

      <div className="flex flex-col gap-16">
        <ListSearchToolbar
          placeholder="Search by name, contact, email, phone…"
          searchAriaLabel="Search suppliers"
          inactiveToggle
        />

        <SupplierList
          suppliers={suppliers}
          stats={stats}
          hasFilters={Boolean(q?.trim() || includeInactive)}
        />

        {totalCount > 0 && (
          <ListPagination
            basePath="/suppliers"
            label="Suppliers pagination"
            page={servedPage}
            totalPages={totalPages}
            pageSize={servedSize}
            totalCount={totalCount}
            shown={suppliers.length}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            baseParams={paginationBaseParams}
          />
        )}
      </div>
    </>
  );
}
