import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
      <header className="hairline-b pb-12 mb-20 flex items-center gap-14">
        <Link
          href={`/suppliers/${id}`}
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text truncate max-w-[200px]">
            {r.supplier.name}
          </span>
        </Link>
        <span className="h-14 w-px bg-[var(--border-subtle)]" aria-hidden />
        <h1
          className="text-text"
          style={{
            fontFamily: "var(--display)",
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          Edit
        </h1>
      </header>

      <SupplierForm mode="edit" initialData={r.supplier} />
    </>
  );
}
