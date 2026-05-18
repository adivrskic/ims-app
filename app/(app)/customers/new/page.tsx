import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CustomerForm } from "../CustomerForm";

export default function NewCustomerPage() {
  return (
    <>
      <header className="hairline-b pb-12 mb-20 flex items-center gap-14">
        <Link
          href="/customers"
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text">Customers</span>
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
          New customer
        </h1>
      </header>

      <CustomerForm mode="create" />
    </>
  );
}
