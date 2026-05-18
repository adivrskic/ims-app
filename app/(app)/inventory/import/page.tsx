import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { CornerLink } from "@/components/ui/CornerButton";
import { ArrowLeft, FileDown } from "lucide-react";
import { ImportForm } from "./ImportForm";

export const metadata = { title: "Import products" };

const COLUMNS = [
  {
    name: "barcode",
    required: true,
    hint: "UPC, EAN, or your internal barcode",
  },
  { name: "name", required: true, hint: "Display name" },
  { name: "internal_sku", required: false, hint: "Your SKU; optional" },
  { name: "manufacturer", required: false, hint: "Brand / vendor" },
  {
    name: "category",
    required: false,
    hint: "Category name (will be matched or created)",
  },
  { name: "reorder_point", required: false, hint: "Numeric; default 0" },
  { name: "dimensions", required: false, hint: "Free-form, e.g. 12×24×0.5in" },
  { name: "weight", required: false, hint: "Free-form, e.g. 2.4lb" },
  { name: "notes", required: false, hint: "Free-form notes" },
];

export default async function ImportPage() {
  return (
    <div className="flex flex-col gap-32">
      <div className="flex flex-col gap-12">
        <Link
          href="/inventory"
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors w-fit"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text">All products</span>
        </Link>
        <PageHeader
          eyebrow="Workspace · Inventory"
          title="Import products"
          description="Bulk-add products from a CSV. Rows with errors are reported back so you can fix and re-upload — the valid rows still ingest on the first pass."
          actions={
            <CornerLink
              href="/api/inventory/import-template"
              variant="ghost"
              size="sm"
            >
              <FileDown size={11} strokeWidth={1.5} />
              Download template
            </CornerLink>
          }
        />
      </div>

      <section aria-labelledby="schema">
        <h2
          id="schema"
          className="label-text mb-12"
          style={{ color: "var(--text-muted)" }}
        >
          — Expected columns
        </h2>
        <div className="hairline bg-[var(--surface)] overflow-hidden">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="hairline-b bg-[var(--surface-2)]">
                <th className="label-text text-left px-14 py-10 font-normal">
                  Column
                </th>
                <th className="label-text text-left px-14 py-10 font-normal">
                  Required
                </th>
                <th className="label-text text-left px-14 py-10 font-normal">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {COLUMNS.map((c) => (
                <tr key={c.name} className="hairline-b">
                  <td className="px-14 py-10">
                    <code
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 12,
                        color: "var(--text)",
                      }}
                    >
                      {c.name}
                    </code>
                  </td>
                  <td className="px-14 py-10">
                    {c.required ? (
                      <span
                        className="label-text"
                        style={{ color: "var(--accent)" }}
                      >
                        Required
                      </span>
                    ) : (
                      <span className="label-text text-text-dim">Optional</span>
                    )}
                  </td>
                  <td className="px-14 py-10 mono-sm text-text-muted">
                    {c.hint}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mono-sm text-text-dim mt-10" style={{ lineHeight: 1.6 }}>
          Column order doesn't matter — we match by header. Extra columns are
          ignored. Empty cells are treated as missing (not as the string
          "null"). Duplicate barcodes are skipped with an error row.
        </p>
      </section>

      <ImportForm />
    </div>
  );
}
