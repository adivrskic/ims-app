import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCustomer } from "../../actions";
import { CustomerForm } from "../../CustomerForm";

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
      <header className="hairline-b pb-12 mb-20 flex items-center gap-14">
        <Link
          href={`/customers/${id}`}
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text truncate max-w-[200px]">
            {r.customer.name}
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

      <CustomerForm mode="edit" initialData={r.customer} />
    </>
  );
}
