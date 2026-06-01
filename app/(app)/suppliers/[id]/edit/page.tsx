import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { getSupplier } from "../../actions";
import { SupplierForm } from "../../SupplierForm";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = await getSupplier(id);
  if (r.error || !r.supplier) notFound();

  return (
    <>
      <PageHeader
        title="Edit"
        backHref={`/suppliers/${id}`}
        backLabel={r.supplier.name}
      />

      <SupplierForm mode="edit" initialData={r.supplier} />
    </>
  );
}
