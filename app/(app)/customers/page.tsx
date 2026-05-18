import { Plus } from "lucide-react";
import { CornerLink } from "@/components/ui/CornerButton";
import { listCustomers } from "./actions";
import { CustomerList } from "./CustomerList";

export default async function CustomersPage() {
  const r = await listCustomers({ includeInactive: true });
  const customers = r.customers ?? [];

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

      {r.error ? (
        <div
          className="hairline bg-[var(--surface)] p-16 mono-sm"
          style={{ color: "var(--danger)" }}
        >
          {r.error}
        </div>
      ) : (
        <CustomerList customers={customers} />
      )}
    </>
  );
}
