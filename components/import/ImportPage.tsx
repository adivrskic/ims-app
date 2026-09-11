import { FileDown } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { CornerLink } from "@/components/ui/CornerButton";
import { IMPORT_SPECS } from "@/lib/import/specs";
import type { ImportEntity } from "@/lib/import/spec";
import type { ImportOutcome } from "@/lib/import/prepare";
import { ImportWorkbench } from "./ImportWorkbench";

interface Props {
  entity: ImportEntity;
  eyebrow: string;
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  action: (formData: FormData) => Promise<ImportOutcome>;
  doneHref: string;
}

/** Shared page body for every entity import: header, expected columns, workbench. */
export function ImportPage({
  entity,
  eyebrow,
  title,
  description,
  backHref,
  backLabel,
  action,
  doneHref,
}: Props) {
  const spec = IMPORT_SPECS[entity];
  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        backHref={backHref}
        backLabel={backLabel}
        actions={
          <CornerLink
            href={`/api/import-template/${entity}`}
            variant="ghost"
            size="sm"
          >
            <FileDown size={11} strokeWidth={1.5} />
            Download template
          </CornerLink>
        }
      />

      <section aria-labelledby="import-source">
        <h2
          id="import-source"
          className="label-text mb-12"
          style={{ color: "var(--text-muted)" }}
        >
          — Your file
        </h2>
        <ImportWorkbench entity={entity} action={action} doneHref={doneHref} />
      </section>

      <section aria-labelledby="import-columns">
        <h2
          id="import-columns"
          className="label-text mb-12"
          style={{ color: "var(--text-muted)" }}
        >
          — Columns we understand
        </h2>
        <div className="hairline bg-[var(--surface)] overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="hairline-b bg-[var(--surface-2)]">
                <th className="label-text text-left px-14 py-10 font-normal">
                  Column
                </th>
                <th className="label-text text-left px-14 py-10 font-normal">
                  Also accepted
                </th>
                <th className="label-text text-left px-14 py-10 font-normal">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {spec.fields.map((f) => (
                <tr key={f.key} className="hairline-b align-top">
                  <td className="px-14 py-10 whitespace-nowrap">
                    <code
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 12,
                        color: "var(--text)",
                      }}
                    >
                      {f.key}
                    </code>
                    {f.required ? (
                      <span
                        className="label-text ml-8"
                        style={{ color: "var(--accent)" }}
                      >
                        Required
                      </span>
                    ) : null}
                  </td>
                  <td className="px-14 py-10 mono-sm text-text-dim">
                    {(f.aliases ?? []).slice(0, 6).join(", ")}
                    {(f.aliases?.length ?? 0) > 6 ? ", …" : ""}
                  </td>
                  <td className="px-14 py-10 mono-sm text-text-muted">
                    {f.hint}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mono-sm text-text-dim mt-10" style={{ lineHeight: 1.6 }}>
          Header matching ignores case, spacing and punctuation — &ldquo;Qty On
          Hand&rdquo; and &ldquo;qty_on_hand&rdquo; are the same column. Extra
          columns are ignored. Empty cells mean &ldquo;not provided&rdquo;.
        </p>
      </section>
    </div>
  );
}
