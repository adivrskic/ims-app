import { ImportPage } from "@/components/import/ImportPage";
import { importSuppliers } from "./actions";

export const metadata = { title: "Import suppliers" };

export default function ImportSuppliersPage() {
  return (
    <ImportPage
      entity="suppliers"
      eyebrow="Directory · Suppliers"
      title="Import suppliers"
      description="Load your vendor list from a spreadsheet — contacts, terms and lead times included. Matched by name; check first, then import."
      backHref="/suppliers"
      backLabel="Suppliers"
      action={importSuppliers}
      doneHref="/suppliers"
    />
  );
}
