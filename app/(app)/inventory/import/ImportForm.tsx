"use client";

import { useActionState, useRef } from "react";
import { Upload, Check, AlertCircle } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { importProductsCsv, type ImportResult } from "./actions";

export function ImportForm() {
  const [state, formAction, pending] = useActionState<
    ImportResult | null,
    FormData
  >(async (_prev, formData) => {
    return await importProductsCsv(formData);
  }, null);

  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <section aria-labelledby="upload">
      <h2
        id="upload"
        className="label-text mb-12"
        style={{ color: "var(--text-muted)" }}
      >
        — Upload file
      </h2>

      <form action={formAction} className="flex flex-col gap-16">
        <div className="hairline bg-[var(--surface)] p-20">
          <label className="flex flex-col gap-10">
            <span className="label-text text-text-muted">CSV file</span>
            <input
              ref={fileRef}
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="mono-sm text-text file:hairline-subtle file:bg-[var(--surface-2)] file:px-12 file:py-8 file:mr-12 file:label-text file:cursor-pointer hover:file:border-[var(--border-hover)]"
            />
          </label>
          <p
            className="mono-sm text-text-dim mt-10"
            style={{ lineHeight: 1.6 }}
          >
            Max 5MB. UTF-8 encoding. The first row must be the header.
          </p>
        </div>

        <div className="flex items-center gap-10">
          <CornerButton
            type="submit"
            variant="primary"
            size="sm"
            loading={pending}
          >
            <Upload size={11} strokeWidth={1.5} />
            Import
          </CornerButton>
          <CornerButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            Reset
          </CornerButton>
        </div>
      </form>

      {state && <ResultPanel result={state} />}
    </section>
  );
}

function ResultPanel({ result }: { result: ImportResult }) {
  const hasErrors = result.errors.length > 0;
  return (
    <div className="hairline mt-20 bg-[var(--surface)]">
      <header className="p-20 hairline-b">
        <div className="flex items-center gap-14">
          <span
            className={`w-32 h-32 hairline-subtle flex items-center justify-center shrink-0 ${
              hasErrors
                ? "bg-[var(--warning-dim)] text-[var(--warning)]"
                : "bg-[var(--success-dim)] text-[var(--success)]"
            }`}
            aria-hidden
          >
            {hasErrors ? (
              <AlertCircle size={14} strokeWidth={1.5} />
            ) : (
              <Check size={14} strokeWidth={1.5} />
            )}
          </span>
          <div>
            <h3
              style={{
                fontFamily: "var(--display)",
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              Import {hasErrors ? "completed with errors" : "complete"}
            </h3>
            <div className="flex items-center gap-14 mono-sm text-text-muted mt-2">
              <span>
                <span className="tnum text-[var(--success)]">
                  {result.imported}
                </span>{" "}
                imported
              </span>
              {result.skipped > 0 && (
                <span>
                  <span className="tnum text-text-secondary">
                    {result.skipped}
                  </span>{" "}
                  skipped
                </span>
              )}
              {hasErrors && (
                <span>
                  <span className="tnum text-[var(--warning)]">
                    {result.errors.length}
                  </span>{" "}
                  errors
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {hasErrors && (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="hairline-b bg-[var(--surface-2)]">
                <th
                  className="label-text text-left px-14 py-10 font-normal"
                  style={{ width: 80 }}
                >
                  Row
                </th>
                <th
                  className="label-text text-left px-14 py-10 font-normal"
                  style={{ width: 180 }}
                >
                  Barcode
                </th>
                <th className="label-text text-left px-14 py-10 font-normal">
                  Error
                </th>
              </tr>
            </thead>
            <tbody>
              {result.errors.map((err, i) => (
                <tr key={i} className="hairline-b">
                  <td className="px-14 py-10 mono-sm tnum text-text-muted">
                    {err.row}
                  </td>
                  <td className="px-14 py-10 mono-sm text-text-secondary">
                    {err.barcode || "—"}
                  </td>
                  <td className="px-14 py-10 mono-sm text-[var(--warning)]">
                    {err.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
