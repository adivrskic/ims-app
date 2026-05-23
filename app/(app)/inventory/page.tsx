import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  InventoryTable,
  type SortKey,
  type SortOrder,
} from "@/components/inventory/InventoryTable";
import {
  CornerButton as Button,
  CornerLink as ButtonLink,
} from "@/components/ui/CornerButton";
import { RegisterProductButton } from "./RegisterProductButton";
import { Boxes, Download, Search } from "lucide-react";
import { getActiveScope, scopeDescription } from "@/lib/facilityScope";
import { InventoryRealtime } from "@/components/realtime/PageRealtime";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getCategories } from "@/lib/data/org";
import { getInventoryList } from "@/lib/data/inventory";

export const metadata = { title: "Inventory" };

interface SearchParams {
  q?: string;
  category?: string;
  sort?: string;
  order?: string;
  register?: string;
}

function parseSort(raw: string | undefined): SortKey {
  if (
    raw === "name" ||
    raw === "updated" ||
    raw === "reorder" ||
    raw === "manufacturer"
  ) {
    return raw;
  }
  return "updated";
}

function parseOrder(raw: string | undefined): SortOrder {
  return raw === "asc" ? "asc" : "desc";
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const {
    q,
    category,
    sort: rawSort,
    order: rawOrder,
    register,
  } = await searchParams;
  const sort = parseSort(rawSort);
  const order = parseOrder(rawOrder);

  const scope = await getActiveScope();
  const ctx = await getCurrentOrgContext();
  const facilityId = scope.mode === "single" ? scope.id : null;

  // Categories rarely change — pull from the cross-request cache.
  // Invalidated by category mutations.
  const categories = ctx ? await getCategories(ctx.orgId) : [];

  // Listing (section resolution + product query + facility-scope location
  // filtering) lives in the cross-request cache (lib/data/inventory.ts),
  // keyed by org + facility + filters and tagged tags.products / tags.inventory.
  const data = ctx
    ? await getInventoryList(ctx.orgId, facilityId, { q, category, sort, order })
    : { products: [], totalCount: 0 };

  const products = data.products;
  const totalCount = data.totalCount;

  // Base params for sort URLs + CSV export — preserves filters
  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (category) baseParams.category = category;

  const exportQuery = new URLSearchParams(baseParams);
  exportQuery.set("sort", sort);
  exportQuery.set("order", order);
  // The export route hits the same query — when we want the export to
  // respect facility scope too, pass the scope id through here:
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
          { label: "Showing", value: totalCount },
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

      {/* Search form. Preserves category/sort/order via hidden inputs. */}
      <form
        action="/inventory"
        method="get"
        className="flex items-center gap-10"
      >
        <div className="relative flex-1 max-w-[420px]">
          <Search
            size={12}
            strokeWidth={1.5}
            className="absolute left-12 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
            aria-hidden
          />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name, SKU, or barcode"
            className="field-shell w-full pl-32 pr-12 py-8 mono-sm"
          />
        </div>
        {category && <input type="hidden" name="category" value={category} />}
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="order" value={order} />
        <Button type="submit" variant="ghost" size="sm">
          Search
        </Button>
      </form>

      {totalCount === 0 ? (
        <EmptyState
          title={
            q || category
              ? "No products match those filters"
              : scope.mode === "single"
              ? `No products at ${scope.name} yet`
              : "No products yet"
          }
          description="Register your first product to start tracking inventory across the floor."
          icon={<Boxes size={20} strokeWidth={1.5} />}
        />
      ) : (
        <InventoryTable
          products={products as never}
          categories={categories ?? []}
          activeCategory={category}
          activeQuery={q}
          sort={sort}
          order={order}
        />
      )}
    </div>
  );
}