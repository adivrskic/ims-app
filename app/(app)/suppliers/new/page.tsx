import { PageHeader } from "@/components/ui/PageHeader";
import { SupplierForm } from "../SupplierForm";

export const metadata = { title: "New supplier" };

export default function NewSupplierPage() {
  return (
    <>
      <PageHeader
        title="New supplier"
        backHref="/suppliers"
        backLabel="Suppliers"
      />

      <SupplierForm mode="create" />
    </>
  );
}
