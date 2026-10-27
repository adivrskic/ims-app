import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCustomer } from "../../actions";
import { CustomerForm } from "../../CustomerForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = await getCustomer(id);
  const name = r.customer?.name;
  return { title: name ? `Edit ${name}` : "Edit customer" };
}

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = await getCustomer(id);
  if (r.error || !r.customer) notFound();

  return (
    <>
      <PageHeader
        title="Edit"
        backHref={`/customers/${id}`}
        backLabel={r.customer.name}
      />

      <CustomerForm mode="edit" initialData={r.customer} />
    </>
  );
}
