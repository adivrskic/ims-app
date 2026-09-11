import { ImportPage } from "@/components/import/ImportPage";
import { importCustomers } from "./actions";

export const metadata = { title: "Import customers" };

export default function ImportCustomersPage() {
  return (
    <ImportPage
      entity="customers"
      eyebrow="Directory · Customers"
      title="Import customers"
      description="Load the people and businesses you sell to from a spreadsheet. Matched by name; check first, then import."
      backHref="/customers"
      backLabel="Customers"
      action={importCustomers}
      doneHref="/customers"
    />
  );
}
