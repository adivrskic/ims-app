import { Plus } from "lucide-react";
import { CornerLink } from "@/components/ui/CornerButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListSearchToolbar } from "@/components/ui/ListSearchToolbar";
import { ListPagination } from "@/components/ui/ListPagination";
import { CustomerList } from "./CustomerList";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getCustomersList } from "@/lib/data/customers";
import {
  parsePage,
  parsePageSize,
  PAGE_SIZE_OPTIONS,
} from "@/lib/listParams";

interface SearchParams {
  q?: string;
  inactive?: string;
  page?: string;
  pageSize?: string;
}

export default async function CustomersPage({
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
  // via the cross-request cache (lib/data/customers.ts), tagged
  // tags.customers(orgId).
  const ctx = await getCurrentOrgContext();
  const data = ctx
    ? await getCustomersList(ctx.orgId, {
        q,
        includeInactive,
        page,
        pageSize,
      })
    : { customers: [], totalCount: 0, page: 1, pageSize, totalPages: 1 };

  const { customers, totalCount, totalPages } = data;
  const servedPage = data.page;
  const servedSize = data.pageSize;

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
        title="Customers"
        description="People and businesses you sell to. Linked to orders and pickups."
        meta={[{ label: "Total", value: totalCount }]}
        actions={
          <CornerLink href="/customers/new" variant="primary" size="sm">
            <Plus size={11} strokeWidth={1.5} />
            New customer
          </CornerLink>
        }
      />

      <div className="flex flex-col gap-16">
        <ListSearchToolbar
          placeholder="Search by name, company, email, phone…"
          searchAriaLabel="Search customers"
          inactiveToggle
        />

        <CustomerList
          customers={customers}
          hasFilters={Boolean(q?.trim() || includeInactive)}
        />

        {totalCount > 0 && (
          <ListPagination
            basePath="/customers"
            label="Customers pagination"
            page={servedPage}
            totalPages={totalPages}
            pageSize={servedSize}
            totalCount={totalCount}
            shown={customers.length}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            baseParams={paginationBaseParams}
          />
        )}
      </div>
    </>
  );
}
