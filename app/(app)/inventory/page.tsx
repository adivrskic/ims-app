import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { InventoryTable } from "@/components/inventory/InventoryTable";
import { InventoryToolbar } from "@/components/inventory/InventoryToolbar";
import { ListPagination } from "@/components/ui/ListPagination";
import { CornerLink as ButtonLink } from "@/components/ui/CornerButton";
import { BulkProductLabelButton } from "@/components/print/BulkProductLabelButton";
import { RegisterProductButton } from "./RegisterProductButton";
import { Boxes, Download, Upload } from "lucide-react";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { InventoryRealtime } from "@/components/realtime/PageRealtime";
import { getActiveMembership, getCurrentOrgContext } from "@/lib/data/user";
import { LoadSampleDataButton } from "@/components/dashboard/SampleDataControls";
import { getCategories } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import {
  getInventoryList,
  parseSort,
  parseOrder,
  PAGE_SIZE_OPTIONS,
} from "@/lib/data/inventory";
import { parsePage, parsePageSize } from "@/lib/listParams";

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

/** PostgREST's silent row cap; the register modal says so when it is hit. */
const PICKER_CAP = 1000;

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

  const [scope, ctx] = await Promise.all([
    getActiveScope(),
    getCurrentOrgContext(),
  ]);
  const facilityId = scope.mode === "single" ? scope.id : null;
  const canManage = ctx?.can("inventory.manage") ?? false;

  // Once the org is known, the membership, the categories (filter dropdown +
  // register form), the active suppliers (the register modal's
  // preferred-supplier picker) and the list itself are independent, so they
  // load in one round instead of four.
  const [membership, categories, suppliers, data] = await Promise.all([
    ctx ? getActiveMembership() : null,
    ctx ? getCategories(ctx.orgId) : [],
    ctx
      ? createClient()
          .then((supabase) =>
            supabase
              .from("suppliers")
              .select("id, name")
              .eq("org_id", ctx.orgId)
              .eq("is_active", true)
              .order("name")
              // TODO: async search picker — PostgREST caps this at 1,000.
              .limit(PICKER_CAP)
          )
          .then(
            ({ data }) => (data ?? []) as Array<{ id: string; name: string }>
          )
      : ([] as Array<{ id: string; name: string }>),
    ctx
      ? getInventoryList(ctx.orgId, facilityId, {
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
        },
  ]);
  const canSeedSample =
    canManage && ctx?.role !== "member" && !membership?.org?.sample_data;

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
  /* Route lives at app/(app)/inventory/export — the route group adds no
     URL segment, so the path is /inventory/export, not /api/…. */
  const exportHref = `/inventory/export?${exportQuery.toString()}`;

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
          <div className="flex items-center gap-10 flex-wrap justify-end">
            {products.length > 0 && (
              <BulkProductLabelButton
                products={products.map((p) => ({
                  id: p.id,
                  name: p.name,
                  barcode: p.barcode,
                  sku: p.internal_sku,
                  category: p.category_name,
                }))}
              />
            )}
            {canManage && (
              <ButtonLink href="/inventory/import" variant="ghost" size="sm">
                <Upload size={11} strokeWidth={1.5} />
                Import
              </ButtonLink>
            )}
            <ButtonLink href={exportHref} variant="ghost" size="sm">
              <Download size={11} strokeWidth={1.5} />
              Export CSV
            </ButtonLink>
            <RegisterProductButton
              categories={categories ?? []}
              suppliers={suppliers}
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
          description={
            q || category || low
              ? "Try widening the filters."
              : "Register products one at a time, or bring your whole catalog in from a spreadsheet — quantities, costs and suppliers included."
          }
          icon={<Boxes size={20} strokeWidth={1.5} />}
          action={
            !(q || category || low) && canManage ? (
              <div className="flex items-center gap-10 flex-wrap justify-center">
                <ButtonLink href="/inventory/import" variant="primary" size="sm">
                  <Upload size={11} strokeWidth={1.5} />
                  Import a spreadsheet
                </ButtonLink>
                <ButtonLink
                  href="/api/import-template/products"
                  variant="ghost"
                  size="sm"
                >
                  <Download size={11} strokeWidth={1.5} />
                  Template
                </ButtonLink>
                {canSeedSample && <LoadSampleDataButton />}
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col">
          <InventoryTable
            products={products}
            sort={sort}
            order={order}
            baseParams={tableBaseParams}
          />
          <ListPagination
            basePath="/inventory"
            label="Inventory pagination"
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
