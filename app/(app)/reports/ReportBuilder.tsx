"use client";

import { useActionState, useState } from "react";
import { Plus, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { CornerButton } from "@/components/ui/CornerButton";
import { REPORT_DATASETS_META, getDatasetMeta } from "@/lib/reports-meta";
import { saveReport } from "./actions";

export function ReportBuilder() {
  const [state, action, pending] = useActionState(saveReport, undefined);
  const [datasetId, setDatasetId] = useState(REPORT_DATASETS_META[0].id);
  const meta = getDatasetMeta(datasetId)!;

  return (
    <form action={action} className="hairline bg-[var(--surface)] p-20 flex flex-col gap-16">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <Input label="Report name" name="name" type="text" maxLength={80} required />
        <label className="field-shell block" data-filled="true">
          <span className="field-label">Dataset</span>
          {/* Remount-free: dataset drives the columns/filters below via state. */}
          <select
            name="dataset"
            value={datasetId}
            onChange={(e) => setDatasetId(e.target.value)}
            className="field-input w-full"
          >
            {REPORT_DATASETS_META.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mono-sm text-text-dim">{meta.description}</p>

      <div>
        <p className="label-text text-text-muted mb-8">Columns</p>
        <div className="flex flex-wrap gap-x-16 gap-y-8">
          {meta.columns.map((c) => (
            <label
              key={c.key}
              className="flex items-center gap-6 mono-sm text-text-secondary select-none cursor-pointer"
            >
              <input
                type="checkbox"
                name="column"
                value={c.key}
                defaultChecked
                className="accent-[var(--accent)]"
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>

      {meta.filters.length > 0 && (
        <div>
          <p className="label-text text-text-muted mb-8">Filters</p>
          <div className="flex flex-wrap items-end gap-12">
            {meta.filters.map((f) => (
              <div key={f.key} className="flex flex-col gap-2" style={{ minWidth: 150 }}>
                <span className="label-text text-text-dim" style={{ fontSize: 9 }}>
                  {f.label}
                </span>
                {f.type === "boolean" ? (
                  <label className="flex items-center gap-6 mono-sm text-text-secondary h-[34px]">
                    <input type="checkbox" name={`f_${f.key}`} value="1" className="accent-[var(--accent)]" />
                    Yes
                  </label>
                ) : f.type === "select" ? (
                  <select name={`f_${f.key}`} className="field-input" defaultValue="">
                    {(f.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.type === "date" ? "date" : "text"}
                    name={`f_${f.key}`}
                    className="hairline-subtle bg-[var(--surface-2)] mono-sm text-text px-8 py-6 focus:border-[var(--accent)] outline-none"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {state?.error && (
        <div
          className="hairline-subtle px-12 py-8 flex items-start gap-8"
          style={{ background: "var(--danger-dim)", color: "var(--danger)" }}
        >
          <AlertTriangle size={11} strokeWidth={1.5} className="mt-1 shrink-0" />
          <span className="mono-sm">{state.error}</span>
        </div>
      )}

      <div>
        <CornerButton type="submit" variant="primary" size="sm" loading={pending} disabled={pending}>
          <Plus size={11} strokeWidth={1.5} />
          Create report
        </CornerButton>
      </div>
    </form>
  );
}
