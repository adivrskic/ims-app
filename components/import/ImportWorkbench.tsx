"use client";

import { useActionState, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ClipboardPaste,
  FileSearch,
  FileUp,
  Upload,
} from "lucide-react";
import { CornerButton, CornerLink } from "@/components/ui/CornerButton";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormActions } from "@/components/ui/FormActions";
import { FormNotice } from "@/components/ui/FormNotice";
import { IMPORT_SPECS } from "@/lib/import/specs";
import type { ImportEntity, ImportSpec } from "@/lib/import/spec";
import type { ImportOutcome } from "@/lib/import/prepare";
import { MAX_IMPORT_ROWS } from "@/lib/import/prepare";

interface Props {
  entity: ImportEntity;
  /** The entity's import server action (products / suppliers / customers). */
  action: (formData: FormData) => Promise<ImportOutcome>;
  /** Where "View …" goes after a successful import. */
  doneHref: string;
}

type Source = "file" | "paste";
type Mode = "check" | "import";

const MAX_ERRORS_SHOWN = 200;

/**
 * Two-phase import: "Check" runs the whole pipeline without writing and
 * shows how the columns matched plus every row problem; "Import" writes.
 * The Import button only appears for a check of the *current* source —
 * touching the file, the pasted text or the options invalidates it.
 */
export function ImportWorkbench({ entity, action, doneHref }: Props) {
  const spec = IMPORT_SPECS[entity];
  const [source, setSource] = useState<Source>("file");
  const [version, setVersion] = useState(0);
  const versionRef = useRef(0);
  const lastMode = useRef<Mode>("check");

  const [result, formAction, pending] = useActionState<
    { outcome: ImportOutcome; version: number } | null,
    FormData
  >(async (_prev, formData) => {
    const v = versionRef.current;
    const outcome = await action(formData);
    return { outcome, version: v };
  }, null);

  // Any change to what would be submitted retires the last check.
  const touch = () => {
    versionRef.current += 1;
    setVersion(versionRef.current);
  };

  const outcome = result?.outcome ?? null;
  const fresh = result !== null && result.version === version;
  const stale = result !== null && !fresh;
  const checked = fresh && outcome?.mode === "check" && !outcome.fatal;
  const canImport = checked && (outcome?.valid ?? 0) > 0;
  const finished = fresh && outcome?.mode === "import" && !outcome.fatal;

  const switchSource = (next: Source) => {
    if (next === source) return;
    setSource(next);
    touch();
  };

  const pasteHint = spec.fields
    .slice(0, 3)
    .map((f) => f.key)
    .join("  ·  ");

  return (
    <div className="flex flex-col gap-20">
      <form action={formAction} className="flex flex-col gap-20">
        {/* ── Source ─────────────────────────────────────────────── */}
        <section
          className="hairline bg-[var(--surface)] p-20 flex flex-col gap-16"
          aria-label="Source"
        >
          <div className="flex items-center gap-6" role="tablist" aria-label="Source">
            <SourceTab
              active={source === "file"}
              onClick={() => switchSource("file")}
              icon={<FileUp size={11} strokeWidth={1.5} />}
              label="Upload a file"
            />
            <SourceTab
              active={source === "paste"}
              onClick={() => switchSource("paste")}
              icon={<ClipboardPaste size={11} strokeWidth={1.5} />}
              label="Paste from a spreadsheet"
            />
          </div>

          {source === "file" ? (
            <label className="flex flex-col gap-10">
              <span className="label-text text-text-muted">
                CSV, TSV or text file
              </span>
              <input
                type="file"
                name="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                onChange={touch}
                className="mono-sm text-text file:hairline-subtle file:bg-[var(--surface-2)] file:px-12 file:py-8 file:mr-12 file:label-text file:cursor-pointer hover:file:border-[var(--border-hover)]"
              />
            </label>
          ) : (
            <Textarea
              label="Rows from your spreadsheet"
              name="text"
              rows={9}
              onChange={touch}
              spellCheck={false}
              placeholder={`Select the cells in Excel or Google Sheets — header row included — copy, and paste here.\n\n${pasteHint}\n…`}
              hint="Tabs (what a copy from a spreadsheet gives you), commas or semicolons all work."
            />
          )}

          <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
            Up to {MAX_IMPORT_ROWS.toLocaleString()} rows or 5MB per run. The
            first row must be the headers. Column order doesn&apos;t matter and
            common names are recognised — SKU, UPC, Qty, Vendor, Price… — so a
            spreadsheet from another system usually imports as-is.
          </p>
        </section>

        {/* ── Options ────────────────────────────────────────────── */}
        <Checkbox
          name="existing"
          value="update"
          onChange={touch}
          label={`Update ${spec.label} that already exist`}
          description={`Matched by ${spec.keyLabel}. Only filled-in cells are applied — a blank cell never erases what you have.${
            entity === "products"
              ? " Quantity is never applied to existing products."
              : ""
          } Off = existing rows are skipped and reported.`}
        />

        {fresh && outcome?.fatal && (
          <FormNotice tone="error">{outcome.fatal}</FormNotice>
        )}
        {stale && (
          <FormNotice tone="info">
            The source changed since the last check — check it again before
            importing.
          </FormNotice>
        )}

        <FormActions
          bare
          status={
            <span className="text-text-dim" style={{ lineHeight: 1.6 }}>
              Nothing is written until you click Import. Rows with problems
              are reported and skipped — the rest still go in.
            </span>
          }
        >
          <CornerButton
            type="submit"
            name="mode"
            value="check"
            variant={canImport ? "ghost" : "primary"}
            size="sm"
            loading={pending && lastMode.current === "check"}
            disabled={pending}
            onClick={() => {
              lastMode.current = "check";
            }}
          >
            <FileSearch size={11} strokeWidth={1.5} />
            {checked ? "Check again" : "Check first"}
          </CornerButton>
          {canImport && outcome && (
            <CornerButton
              type="submit"
              name="mode"
              value="import"
              variant="primary"
              size="sm"
              loading={pending && lastMode.current === "import"}
              disabled={pending}
              onClick={() => {
                lastMode.current = "import";
              }}
            >
              <Upload size={11} strokeWidth={1.5} />
              Import {outcome.valid.toLocaleString()}{" "}
              {outcome.valid === 1 ? spec.singular : spec.label}
            </CornerButton>
          )}
        </FormActions>
      </form>

      {fresh && outcome && !outcome.fatal && (
        <ResultPanel
          outcome={outcome}
          spec={spec}
          doneHref={finished ? doneHref : null}
        />
      )}
    </div>
  );
}

function SourceTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-6 px-12 py-8 label-text transition-colors hairline-subtle ${
        active
          ? "bg-[var(--accent-dim)] border-[var(--accent-soft)] text-text"
          : "text-text-muted hover:text-text hover:border-[var(--border-hover)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ResultPanel({
  outcome,
  spec,
  doneHref,
}: {
  outcome: ImportOutcome;
  spec: ImportSpec;
  doneHref: string | null;
}) {
  const isImport = outcome.mode === "import";
  const hasErrors = outcome.errors.length > 0;
  const matched = outcome.mapping.filter((m) => m.header !== null);
  const absentOptional = outcome.mapping.filter(
    (m) => m.header === null && !m.required
  );

  const title = isImport
    ? outcome.imported + outcome.updated === 0
      ? `Nothing imported`
      : `Imported ${outcome.imported.toLocaleString()} ${
          outcome.imported === 1 ? spec.singular : spec.label
        }${
          outcome.updated > 0
            ? `, updated ${outcome.updated.toLocaleString()}`
            : ""
        }`
    : outcome.valid === 0
    ? "Nothing ready to import yet"
    : `${outcome.valid.toLocaleString()} of ${outcome.total.toLocaleString()} rows ready`;

  const good = isImport
    ? outcome.imported + outcome.updated > 0
    : outcome.valid > 0;

  return (
    <section
      className="hairline bg-[var(--surface)] flex flex-col"
      aria-live="polite"
      aria-label={isImport ? "Import result" : "Check result"}
    >
      <header className="p-20 hairline-b flex items-start gap-14">
        <span
          className={`w-32 h-32 hairline-subtle flex items-center justify-center shrink-0 ${
            good && !hasErrors
              ? "bg-[var(--success-dim)] text-[var(--success)]"
              : good
              ? "bg-[var(--warning-dim)] text-[var(--warning)]"
              : "bg-[var(--danger-dim)] text-[var(--danger)]"
          }`}
          aria-hidden
        >
          {good ? (
            <Check size={14} strokeWidth={1.5} />
          ) : (
            <AlertCircle size={14} strokeWidth={1.5} />
          )}
        </span>
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <h3
            style={{
              fontFamily: "var(--display)",
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            {title}
          </h3>
          <p className="mono-sm text-text-muted flex flex-wrap gap-x-14 gap-y-4">
            <span>
              <span className="tnum text-text-secondary">
                {outcome.total.toLocaleString()}
              </span>{" "}
              rows read ({outcome.delimiter}-separated)
            </span>
            {outcome.skipped > 0 && (
              <span>
                <span className="tnum text-text-secondary">
                  {outcome.skipped.toLocaleString()}
                </span>{" "}
                already existed
              </span>
            )}
            {hasErrors && (
              <span>
                <span className="tnum text-[var(--warning)]">
                  {outcome.errors.length.toLocaleString()}
                </span>{" "}
                {outcome.errors.length === 1 ? "row" : "rows"} with problems
              </span>
            )}
          </p>
          {outcome.notes.length > 0 && (
            <ul className="mono-sm text-text-muted flex flex-col gap-2">
              {outcome.notes.map((n, i) => (
                <li key={i}>— {n}</li>
              ))}
            </ul>
          )}
        </div>
        {doneHref && (
          <CornerLink href={doneHref} variant="primary" size="sm">
            View {spec.label}
            <ArrowRight size={11} strokeWidth={1.5} />
          </CornerLink>
        )}
      </header>

      {/* Column matching — the part people used to have to guess at. */}
      <div className="px-20 py-16 hairline-b flex flex-col gap-10">
        <p className="label-text text-text-muted">
          — How your columns matched
        </p>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-24 gap-y-6">
          {matched.map((m) => (
            <li
              key={m.field}
              className="mono-sm flex items-baseline gap-8 min-w-0"
            >
              <span className="text-text shrink-0">{m.label}</span>
              <span className="text-text-dim shrink-0">←</span>
              <span className="text-text-secondary truncate">
                {m.header}
                {m.note ? (
                  <span className="text-[var(--warning)]"> · {m.note}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        {absentOptional.length > 0 && (
          <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
            Not in your file (fine, all optional):{" "}
            {absentOptional.map((m) => m.label).join(", ")}.
          </p>
        )}
        {outcome.unmatched.length > 0 && (
          <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
            Ignored columns: {outcome.unmatched.join(", ")}.
          </p>
        )}
      </div>

      {hasErrors && (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="hairline-b bg-[var(--surface-2)]">
                <th
                  className="label-text text-left px-14 py-10 font-normal"
                  style={{ width: 72 }}
                >
                  Row
                </th>
                <th
                  className="label-text text-left px-14 py-10 font-normal"
                  style={{ width: 180 }}
                >
                  {spec.keyLabel}
                </th>
                <th className="label-text text-left px-14 py-10 font-normal">
                  Problem
                </th>
              </tr>
            </thead>
            <tbody>
              {outcome.errors.slice(0, MAX_ERRORS_SHOWN).map((err, i) => (
                <tr key={`${err.row}-${i}`} className="hairline-b">
                  <td className="px-14 py-10 mono-sm tnum text-text-muted">
                    {err.row || "—"}
                  </td>
                  <td className="px-14 py-10 mono-sm text-text-secondary truncate max-w-[180px]">
                    {err.key || "—"}
                  </td>
                  <td className="px-14 py-10 mono-sm text-[var(--warning)]">
                    {err.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {outcome.errors.length > MAX_ERRORS_SHOWN && (
            <p className="px-14 py-10 mono-sm text-text-dim">
              + {outcome.errors.length - MAX_ERRORS_SHOWN} more — fix these
              first and check again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
