import { Plus } from "lucide-react";
import { CornerLink } from "@/components/ui/CornerButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { CustomerList } from "./CustomerList";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getCustomersList } from "@/lib/data/customers";

export default async function CustomersPage() {
  // Customers come from the cross-request cache (lib/data/customers.ts),
  // tagged tags.customers(orgId). The CustomerList component does the
  // active/search filtering client-side.
  const ctx = await getCurrentOrgContext();
  const customers = ctx ? await getCustomersList(ctx.orgId) : [];

  return (
    <>
      <PageHeader
        eyebrow="Directory"
        title="Customers"
        description="People and businesses you sell to. Linked to orders and pickups."
        actions={
          <CornerLink href="/customers/new" variant="primary" size="sm">
            <Plus size={11} strokeWidth={1.5} />
            New customer
          </CornerLink>
        }
      />

      <CustomerList customers={customers} />
    </>
  );
}