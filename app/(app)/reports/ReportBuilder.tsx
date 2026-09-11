"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormSection } from "@/components/ui/FormSection";
import { FormActions } from "@/components/ui/FormActions";
import { FormNotice } from "@/components/ui/FormNotice";
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
        {/* Remount-free: dataset drives the columns/filters below via state. */}
        <Select
          label="Dataset"
          name="dataset"
          value={datasetId}
          onChange={setDatasetId}
          options={REPORT_DATASETS_META.map((d) => ({
            value: d.id,
            label: d.label,
          }))}
        />
      </div>
      <p className="mono-sm text-text-dim">{meta.description}</p>

      <FormSection variant="plain" title="Columns">
        <div className="flex flex-wrap gap-x-16 gap-y-8">
          {meta.columns.map((c) => (
            <Checkbox
              key={c.key}
              name="column"
              value={c.key}
              defaultChecked
              label={c.label}
            />
          ))}
        </div>
      </FormSection>

      {meta.filters.length > 0 && (
        <FormSection variant="plain" title="Filters">
          <div className="flex flex-wrap items-end gap-12">
            {meta.filters.map((f) => (
              <div key={f.key} className="flex flex-col gap-2" style={{ minWidth: 150 }}>
                <span className="label-text text-text-dim" style={{ fontSize: 9 }}>
                  {f.label}
                </span>
                {f.type === "boolean" ? (
                  <div className="flex items-center h-[34px]">
                    <Checkbox name={`f_${f.key}`} value="1" label="Yes" />
                  </div>
                ) : f.type === "select" ? (
                  <Select
                    name={`f_${f.key}`}
                    defaultValue=""
                    compact
                    ariaLabel={f.label}
                    options={(f.options ?? []).map((o) => ({
                      value: o.value,
                      label: o.label,
                    }))}
                  />
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
        </FormSection>
      )}

      {state?.error && <FormNotice>{state.error}</FormNotice>}

      <FormActions>
        <CornerButton type="submit" variant="primary" size="sm" loading={pending} disabled={pending}>
          <Plus size={11} strokeWidth={1.5} />
          Create report
        </CornerButton>
      </FormActions>
    </form>
  );
}
