import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SupplierForm } from "../SupplierForm";

export default function NewSupplierPage() {
  return (
    <>
      <header className="hairline-b pb-12 mb-20 flex items-center gap-14">
        <Link
          href="/suppliers"
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text">Suppliers</span>
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
          New supplier
        </h1>
      </header>

      <SupplierForm mode="create" />
    </>
  );
}
