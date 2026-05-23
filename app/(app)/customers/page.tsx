import { Plus } from "lucide-react";
import { CornerLink } from "@/components/ui/CornerButton";
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
      <header className="hairline-b pb-16 mb-20 flex items-center gap-14">
        <div className="flex flex-col gap-4 min-w-0">
          <h1
            className="text-text"
            style={{
              fontFamily: "var(--display)",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.2px",
            }}
          >
            Customers
          </h1>
          <p
            className="text-text-dim"
            style={{ fontFamily: "var(--mono)", fontSize: 11 }}
          >
            People and businesses you sell to. Linked to orders and pickups.
          </p>
        </div>
        <CornerLink
          href="/customers/new"
          variant="primary"
          size="sm"
          className="ml-auto"
        >
          <Plus size={11} strokeWidth={1.5} />
          New customer
        </CornerLink>
      </header>

      <CustomerList customers={customers} />
    </>
  );
}