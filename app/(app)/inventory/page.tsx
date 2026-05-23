import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { InventoryTable } from "@/components/inventory/InventoryTable";
import { InventoryToolbar } from "@/components/inventory/InventoryToolbar";
import { InventoryPagination } from "@/components/inventory/InventoryPagination";
import { CornerLink as ButtonLink } from "@/components/ui/CornerButton";
import { RegisterProductButton } from "./RegisterProductButton";
import { Boxes, Download } from "lucide-react";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { InventoryRealtime } from "@/components/realtime/PageRealtime";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getCategories } from "@/lib/data/org";
import {
  getInventoryList,
  parseSort,
  parseOrder,
  PAGE_SIZE_OPTIONS,
  DEFAULT_PAGE_SIZE,
} from "@/lib/data/inventory";

export const metadata = { title: "Inventory" };

interface SearchParams {
  q?: string;
  category?: string;
  low?: string;
  sort?: string;
  order?: string;
  page?: string;
  pageSize?: string;
  register?: string;
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function parsePageSize(raw: string | undefined): number {
  const n = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
    ? n
    : DEFAULT_PAGE_SIZE;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const {
    q,
    category,
    low: rawLow,
    sort: rawSort,
    order: rawOrder,
    page: rawPage,
    pageSize: rawPageSize,
    register,
  } = await searchParams;

  const sort = parseSort(rawSort);
  const order = parseOrder(rawOrder);
  const low = rawLow === "1";
  const page = parsePage(rawPage);
  const pageSize = parsePageSize(rawPageSize);

  const scope = await getActiveScope();
  const ctx = await getCurrentOrgContext();
  const facilityId = scope.mode === "single" ? scope.id : null;

  // Categories (id + name) drive both the filter dropdown and the register form.
  const categories = ctx ? await getCategories(ctx.orgId) : [];

  const data = ctx
    ? await getInventoryList(ctx.orgId, facilityId, {
        q,
        category,
        low,
        sort,
        order,
        page,
        pageSize,
      })
    : {
        products: [],
        totalCount: 0,
        page: 1,
        pageSize,
        totalPages: 1,
      };

  const { products, totalCount, totalPages } = data;
  const servedPage = data.page;
  const servedSize = data.pageSize;

  const filterParams: Record<string, string> = {};
  if (q) filterParams.q = q;
  if (category) filterParams.category = category;
  if (low) filterParams.low = "1";

  const tableBaseParams: Record<string, string> = {
    ...filterParams,
    pageSize: String(servedSize),
  };

  const paginationBaseParams: Record<string, string> = {
    ...filterParams,
    sort,
    order,
    pageSize: String(servedSize),
  };

  const exportQuery = new URLSearchParams(filterParams);
  exportQuery.set("sort", sort);
  exportQuery.set("order", order);
  if (scope.mode === "single") exportQuery.set("facility", scope.id);
  const exportHref = `/api/inventory/export?${exportQuery.toString()}`;

  return (
    <div className="flex flex-col gap-40">
      <InventoryRealtime
        warehouseId={scope.mode === "single" ? scope.id : null}
      />
      <PageHeader
        eyebrow="Workspace · Inventory"
        title="Inventory"
        description={scopeDescription(scope, {
          all: "Every SKU across every facility, with its current location, on-hand count, and recent activity.",
          single: (name) =>
            `Every SKU in the catalog, with on-hand counts at ${name}.`,
        })}
        meta={[
          { label: "Total", value: totalCount },
          ...(scope.mode === "single"
            ? [{ label: "Facility", value: scope.name }]
            : []),
        ]}
        actions={
          <div className="flex items-center gap-10">
            <ButtonLink href={exportHref} variant="ghost" size="sm">
              <Download size={11} strokeWidth={1.5} />
              Export CSV
            </ButtonLink>
            <RegisterProductButton
              categories={categories ?? []}
              initialBarcode={register}
            />
          </div>
        }
      />

      <InventoryToolbar categories={categories ?? []} />

      {totalCount === 0 ? (
        <EmptyState
          title={
            q || category || low
              ? "No products match those filters"
              : scope.mode === "single"
              ? `No products at ${scope.name} yet`
              : "No products yet"
          }
          description="Register your first product to start tracking inventory across the floor."
          icon={<Boxes size={20} strokeWidth={1.5} />}
        />
      ) : (
        <div className="flex flex-col">
          <InventoryTable
            products={products}
            sort={sort}
            order={order}
            baseParams={tableBaseParams}
          />
          <InventoryPagination
            page={servedPage}
            totalPages={totalPages}
            pageSize={servedSize}
            totalCount={totalCount}
            shown={products.length}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            baseParams={paginationBaseParams}
          />
        </div>
      )}
    </div>
  );
}
