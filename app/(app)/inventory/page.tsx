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

  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true });

  let query = supabase
    .from("products")
    .select(
      `
      id, name, barcode, internal_sku, manufacturer, reorder_point, updated_at,
      category:categories ( id, name ),
      locations:locations ( quantity, bay, level, section:sections ( code, name ) )
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

  const { data: products } = await query;
  const totalCount = products?.length ?? 0;

  // Base params for sort URLs + CSV export — preserves filters
  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (category) baseParams.category = category;

  const exportQuery = new URLSearchParams(baseParams);
  exportQuery.set("sort", sort);
  exportQuery.set("order", order);
  const exportHref = `/api/inventory/export?${exportQuery.toString()}`;

  return (
    <div className="flex flex-col gap-40">
      <PageHeader
        eyebrow="Workspace · Inventory"
        title="Inventory"
        description="Every SKU across every facility, with its current location, on-hand count, and recent activity."
        actions={
          <>
            <ButtonLink href={exportHref} variant="ghost" size="sm">
              <Download size={12} strokeWidth={1.5} /> Export CSV
            </ButtonLink>
            <RegisterProductButton categories={categories ?? []} />
          </>
        }
        meta={[
          { label: "Showing", value: `${totalCount} of ${totalCount}` },
          { label: "Updated", value: "Just now", status: "live" },
        ]}
      />

      <form
        method="get"
        action="/inventory"
        className="flex flex-wrap items-center gap-12 hairline bg-[var(--surface)] p-12"
      >
        <label className="field-shell flex items-center gap-8 px-12 py-8 flex-1 min-w-[260px] max-w-[480px]">
          <Search
            size={13}
            strokeWidth={1.5}
            className="text-text-dim shrink-0"
          />
          <input
            className="field-input !p-0 !text-[12px] flex-1"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name, barcode, or SKU…"
            aria-label="Search inventory"
          />
        </label>

        <div className="flex items-center gap-8 flex-wrap">
          <span className="label-text text-text-muted">Category</span>
          <select
            name="category"
            defaultValue={category ?? ""}
            className="hairline-subtle mono-sm text-text px-12 py-8 bg-[var(--surface-2)] cursor-pointer hover:border-[var(--border-hover)] transition-colors"
            aria-label="Filter by category"
          >
            <option value="">All</option>
            {(categories ?? []).map((c: { id: string; name: string }) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* preserve sort across filter changes */}
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="order" value={order} />

        <div className="flex items-center gap-8 ml-auto">
          {(q || category) && (
            <ButtonLink href="/inventory" variant="ghost" size="sm">
              Clear
            </ButtonLink>
          )}
          <Button type="submit" variant="primary" size="sm">
            Apply
          </Button>
        </div>
      </form>

      {!products || products.length === 0 ? (
        <EmptyState
          title={
            q || category ? "Nothing matches those filters" : "No products yet"
          }
          description={
            q || category
              ? "Try a different search term or category."
              : "Register your first product from the mobile app or via API to start tracking inventory."
          }
          icon={<Boxes size={24} strokeWidth={1.5} />}
        />
      ) : (
        <InventoryTable
          products={products}
          sort={sort}
          order={order}
          baseParams={baseParams}
        />
      )}
    </div>
  );
}
