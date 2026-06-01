import { PageHeader } from "@/components/ui/PageHeader";
import { CustomerForm } from "../CustomerForm";

export default function NewCustomerPage() {
  return (
    <>
      <PageHeader
        title="New customer"
        backHref="/customers"
        backLabel="Customers"
      />

      <CustomerForm mode="create" />
    </>
  );
}
