import { createClient } from "@/lib/supabase/server";
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

export const metadata = { title: "Inventory" };

interface SearchParams {
  q?: string;
  category?: string;
  sort?: string;
  order?: string;
}

const SORT_COLUMNS: Record<SortKey, string> = {
  name: "name",
  updated: "updated_at",
  reorder: "reorder_point",
  manufacturer: "manufacturer",
};

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
  const { q, category, sort: rawSort, order: rawOrder } = await searchParams;
  const sort = parseSort(rawSort);
  const order = parseOrder(rawOrder);

  const scope = await getActiveScope();
  const supabase = await createClient();

  // Products are org-scoped, not facility-scoped — the catalog itself
  // doesn't change when you flip facilities. What changes is the
  // location data we surface per product.
  //
  // We pre-fetch valid section IDs for the active facility (if scoped)
  // and then strip non-matching locations out of each product's
  // `locations` array after the main fetch. Cheap because section
  // counts are tiny (10s) and the embedded locations are already in
  // memory.
  let validSectionIds: Set<string> | null = null;
  if (scope.mode === "single") {
    const { data: sec } = await supabase
      .from("sections")
      .select("id")
      .eq("warehouse_id", scope.id);
    validSectionIds = new Set((sec ?? []).map((s) => s.id));
  }

  // Categories rarely change — pull from the cross-request cache instead
  // of re-querying on every page render. Invalidated by category mutations.
  const ctx = await getCurrentOrgContext();
  const categories = ctx ? await getCategories(ctx.orgId) : [];

  // Note: locations now includes `section_id` in the select so we can
  // post-filter without re-querying.
  let query = supabase
    .from("products")
    .select(
      `
      id, name, barcode, internal_sku, manufacturer, reorder_point, updated_at,
      category:categories ( id, name ),
      locations:locations ( quantity, bay, level, section_id, section:sections ( code, name ) )
    `
    )
    .order(SORT_COLUMNS[sort], {
      ascending: order === "asc",
      nullsFirst: false,
    })
    .limit(200);

  if (q && q.trim().length > 0) {
    const term = `%${q.trim()}%`;
    query = query.or(
      `name.ilike.${term},barcode.ilike.${term},internal_sku.ilike.${term}`
    );
  }
  if (category) query = query.eq("category_id", category);

  const { data: rawProducts } = await query;

  // Strip non-facility locations when scoped. Products stay in the
  // list even if they have 0 locations at the active facility — the
  // catalog should always reflect what's registered, just with the
  // facility-specific quantity (which can be 0).
  type ProductRow = {
    id: string;
    locations: Array<{
      section_id: string | null;
      [k: string]: unknown;
    }> | null;
    [k: string]: unknown;
  };
  const products = ((rawProducts as ProductRow[] | null) ?? []).map((p) => {
    if (!validSectionIds) return p;
    return {
      ...p,
      locations: (p.locations ?? []).filter(
        (l) => l.section_id && validSectionIds!.has(l.section_id)
      ),
    };
  });
  const totalCount = products.length;

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
            <RegisterProductButton categories={categories ?? []} />
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
