"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import {
  Upload,
  X,
  FileDown,
  Check,
  AlertCircle,
  Loader2,
  Users,
  Copy,
} from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import {
  previewBulkInvite,
  executeBulkInvite,
  type BulkPreviewResult,
  type BulkPreviewRow,
  type BulkExecuteResult,
} from "./bulkInviteActions";

type Step = "idle" | "previewing" | "preview_ready" | "executing" | "done";

interface Props {
  orgId: string;
}

const STATUS_DOT: Record<BulkPreviewRow["status"], string> = {
  new: "dot-live",
  existing_user: "dot-online",
  already_member: "dot-offline",
  error: "dot-offline",
};

const STATUS_LABEL: Record<BulkPreviewRow["status"], string> = {
  new: "New invite",
  existing_user: "Add existing",
  already_member: "Skip",
  error: "Skip",
};

const STATUS_COLOR: Record<BulkPreviewRow["status"], string> = {
  new: "var(--accent)",
  existing_user: "var(--success)",
  already_member: "var(--text-dim)",
  error: "var(--warning)",
};

export function BulkInviteButton({ orgId }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [preview, setPreview] = useState<BulkPreviewResult | null>(null);
  const [executeResult, setExecuteResult] = useState<BulkExecuteResult | null>(
    null
  );
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Esc to close, only when not mid-execute
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "executing") {
        closeAndReset();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  function closeAndReset() {
    setOpen(false);
    // Delay state reset so the modal animates out cleanly
    setTimeout(() => {
      setStep("idle");
      setPreview(null);
      setExecuteResult(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }, 200);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setStep("previewing");

    const formData = new FormData();
    formData.append("file", f);
    formData.append("org_id", orgId);

    startTransition(async () => {
      const result = await previewBulkInvite(formData);
      setPreview(result);
      setStep("preview_ready");
    });
  }

  async function handleExecute() {
    if (!file) return;
    setStep("executing");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("org_id", orgId);

    startTransition(async () => {
      const result = await executeBulkInvite(formData);
      setExecuteResult(result);
      setStep("done");
    });
  }

  const actionableCount =
    (preview?.summary.new_users ?? 0) + (preview?.summary.existing_users ?? 0);

  return (
    <>
      <CornerButton
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Users size={11} strokeWidth={1.5} />
        Bulk invite
      </CornerButton>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-16"
          style={{
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && step !== "executing") {
              closeAndReset();
            }
          }}
        >
          <div
            className="hairline bg-[var(--surface)] w-full max-w-4xl flex flex-col"
            style={{ maxHeight: "85vh" }}
            role="dialog"
            aria-labelledby="bulk-invite-title"
            aria-modal="true"
          >
            {/* Header */}
            <header className="px-24 py-16 hairline-b flex items-center justify-between gap-14">
              <div>
                <p
                  className="label-text mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  Workspace · Members
                </p>
                <h2
                  id="bulk-invite-title"
                  style={{
                    fontFamily: "var(--display)",
                    fontSize: 18,
                    fontWeight: 500,
                    color: "var(--text)",
                  }}
                >
                  Bulk invite team
                </h2>
              </div>
              <button
                type="button"
                onClick={closeAndReset}
                disabled={step === "executing"}
                className="hairline-subtle p-8 text-text-muted hover:text-text hover:border-[var(--border-hover)] disabled:opacity-40 transition-colors"
                aria-label="Close"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </header>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-24 py-20">
              {step === "idle" && (
                <IdlePanel
                  onFileSelected={handleFileChange}
                  fileInputRef={fileInputRef}
                />
              )}
              {step === "previewing" && (
                <LoadingPanel label="Validating rows" />
              )}
              {step === "preview_ready" && preview && (
                <PreviewPanel preview={preview} />
              )}
              {step === "executing" && (
                <LoadingPanel label="Provisioning accounts" />
              )}
              {step === "done" && executeResult && (
                <ResultPanel result={executeResult} />
              )}
            </div>

            {/* Footer */}
            <footer className="px-24 py-16 hairline-t flex items-center justify-between gap-14">
              {step === "idle" && (
                <>
                  <p className="mono-sm text-text-muted">
                    CSV with email + role required. Other fields optional.
                  </p>
                  <CornerButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={closeAndReset}
                  >
                    Cancel
                  </CornerButton>
                </>
              )}

              {step === "preview_ready" && preview && (
                <>
                  <div className="flex items-center gap-14 mono-sm">
                    {preview.summary.new_users > 0 && (
                      <CountChip
                        label="new"
                        value={preview.summary.new_users}
                        color="var(--accent)"
                      />
                    )}
                    {preview.summary.existing_users > 0 && (
                      <CountChip
                        label="existing"
                        value={preview.summary.existing_users}
                        color="var(--success)"
                      />
                    )}
                    {preview.summary.already_members > 0 && (
                      <CountChip
                        label="members"
                        value={preview.summary.already_members}
                        color="var(--text-muted)"
                      />
                    )}
                    {preview.summary.errors > 0 && (
                      <CountChip
                        label="errors"
                        value={preview.summary.errors}
                        color="var(--warning)"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-10">
                    <CornerButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setStep("idle");
                        setPreview(null);
                        setFile(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                    >
                      Re-upload
                    </CornerButton>
                    <CornerButton
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleExecute}
                      disabled={actionableCount === 0 || pending}
                    >
                      Send {actionableCount} invitation
                      {actionableCount === 1 ? "" : "s"}
                    </CornerButton>
                  </div>
                </>
              )}

              {step === "done" && (
                <>
                  <p className="mono-sm text-text-muted">
                    Invitations dispatched. New members appear in the team list
                    on next refresh.
                  </p>
                  <CornerButton
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={closeAndReset}
                  >
                    Done
                  </CornerButton>
                </>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================
 * Sub-panels
 * ============================================================ */

function IdlePanel({
  onFileSelected,
  fileInputRef,
}: {
  onFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="flex flex-col gap-20">
      <div>
        <p className="label-text mb-12" style={{ color: "var(--text-muted)" }}>
          — Upload roster
        </p>
        <label className="hairline-subtle bg-[var(--surface-2)] block px-20 py-32 text-center cursor-pointer hover:border-[var(--border-hover)] transition-colors">
          <Upload
            size={20}
            strokeWidth={1.5}
            className="mx-auto mb-10 text-text-muted"
            aria-hidden
          />
          <p
            className="text-text mb-4"
            style={{ fontFamily: "var(--display)", fontSize: 13 }}
          >
            Choose a CSV file
          </p>
          <p className="mono-sm text-text-dim">
            Max 2MB · up to 200 rows · UTF-8 encoded
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileSelected}
            className="sr-only"
          />
        </label>
      </div>

      <div className="hairline-t pt-20">
        <p className="label-text mb-10" style={{ color: "var(--text-muted)" }}>
          — Expected columns
        </p>
        <div className="hairline bg-[var(--surface-2)]">
          <ColumnRow name="email" required hint="Used to send the invitation" />
          <ColumnRow name="role" required hint="owner | admin | member" />
          <ColumnRow
            name="full_name"
            hint="Otherwise the profile starts blank"
          />
          <ColumnRow name="phone" hint="Useful for ops staff directory" />
          <ColumnRow
            name="facility"
            hint="Warehouse name or slug — sets their default location"
            last
          />
        </div>
        <a
          href="/api/team/import-template"
          className="mt-12 inline-flex items-center gap-6 mono-sm text-text-muted hover:text-text transition-colors"
        >
          <FileDown size={11} strokeWidth={1.5} />
          Download template
        </a>
      </div>

      <div
        className="hairline-subtle border-[rgba(245,181,69,0.45)] bg-[var(--warning-dim)] px-14 py-12 flex items-start gap-10"
        role="note"
      >
        <AlertCircle
          size={12}
          strokeWidth={1.5}
          className="text-[var(--warning)] mt-2 shrink-0"
          aria-hidden
        />
        <div>
          <p
            className="text-[var(--warning)] mb-2"
            style={{
              fontFamily: "var(--display)",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Custom SMTP recommended for &gt;4 invitations
          </p>
          <p
            className="mono-sm text-text-secondary"
            style={{ lineHeight: 1.6 }}
          >
            Supabase's built-in email service caps at ~4 invites per hour. For
            larger teams, configure a custom SMTP provider (Resend / SendGrid)
            in Supabase Auth → Email settings before bulk-importing.
          </p>
        </div>
      </div>
    </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-14 py-40">
      <Loader2
        size={24}
        strokeWidth={1.5}
        className="text-text-muted animate-spin"
        aria-hidden
      />
      <p className="text-text-secondary mono-sm" aria-live="polite">
        {label}…
      </p>
    </div>
  );
}

function PreviewPanel({ preview }: { preview: BulkPreviewResult }) {
  if (preview.fatal_error) {
    return (
      <div className="hairline-subtle border-[rgba(239,79,94,0.45)] bg-[var(--danger-dim)] px-14 py-12 flex items-start gap-10">
        <AlertCircle
          size={14}
          strokeWidth={1.5}
          className="text-[var(--danger)] mt-2 shrink-0"
          aria-hidden
        />
        <div>
          <p
            className="text-[var(--danger)] mb-4"
            style={{
              fontFamily: "var(--display)",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Could not parse file
          </p>
          <p
            className="mono-sm text-text-secondary"
            style={{ lineHeight: 1.6 }}
          >
            {preview.fatal_error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-14">
      <p className="label-text" style={{ color: "var(--text-muted)" }}>
        — Review {preview.summary.total} row
        {preview.summary.total === 1 ? "" : "s"}
      </p>

      <div className="hairline overflow-hidden">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr className="hairline-b bg-[var(--surface-2)]">
              <th
                className="label-text text-left px-12 py-8 font-normal"
                style={{ width: 40 }}
              >
                #
              </th>
              <th className="label-text text-left px-12 py-8 font-normal">
                Email
              </th>
              <th className="label-text text-left px-12 py-8 font-normal">
                Name
              </th>
              <th className="label-text text-left px-12 py-8 font-normal">
                Role
              </th>
              <th className="label-text text-left px-12 py-8 font-normal">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((r) => (
              <tr key={r.row_number} className="hairline-b">
                <td
                  className="px-12 py-10 mono-sm tnum"
                  style={{ color: "var(--text-dim)" }}
                >
                  {r.row_number}
                </td>
                <td
                  className="px-12 py-10 mono-sm text-text-secondary truncate"
                  style={{ maxWidth: 240 }}
                >
                  {r.email || "—"}
                </td>
                <td
                  className="px-12 py-10 text-text"
                  style={{ fontFamily: "var(--display)", fontSize: 12 }}
                >
                  {r.full_name || "—"}
                </td>
                <td
                  className="px-12 py-10 mono-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {r.role || "—"}
                </td>
                <td className="px-12 py-10">
                  <div className="flex items-center gap-8">
                    <span
                      className={`dot ${STATUS_DOT[r.status]}`}
                      aria-hidden
                    />
                    <div className="flex flex-col">
                      <span
                        className="label-text"
                        style={{ color: STATUS_COLOR[r.status] }}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                      {r.message && (
                        <span
                          className="mono-sm"
                          style={{
                            color: "var(--text-muted)",
                            fontSize: 10,
                            lineHeight: 1.4,
                          }}
                        >
                          {r.message}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultPanel({ result }: { result: BulkExecuteResult }) {
  const hasErrors = result.errors.length > 0;
  return (
    <div className="flex flex-col gap-20">
      <div className="hairline bg-[var(--surface-2)] p-20 flex items-start gap-14">
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
        <div className="flex-1">
          <p
            className="label-text mb-4"
            style={{
              color: hasErrors ? "var(--warning)" : "var(--success)",
            }}
          >
            {hasErrors ? "Completed with errors" : "All invitations sent"}
          </p>
          <p
            className="text-text mb-6"
            style={{
              fontFamily: "var(--display)",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {result.invited} invited · {result.added} added · {result.failed}{" "}
            failed
          </p>
          <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
            New users will receive an invitation email shortly. Existing
            Nautilus users have been added to this workspace immediately and
            will see it on next sign-in.
          </p>
        </div>
      </div>

      {result.magic_links.length > 0 && (
        <div>
          <p
            className="label-text mb-10"
            style={{ color: "var(--text-muted)" }}
          >
            — Magic links (if any emails get stuck)
          </p>
          <div className="hairline overflow-hidden">
            {result.magic_links.map((m, i) => (
              <div
                key={i}
                className={`px-14 py-10 flex items-center gap-10 ${
                  i < result.magic_links.length - 1 ? "hairline-b" : ""
                }`}
              >
                <span
                  className="mono-sm text-text-secondary shrink-0"
                  style={{ minWidth: 160, fontSize: 11 }}
                >
                  {m.email}
                </span>
                <code
                  className="flex-1 min-w-0 truncate text-text-dim"
                  style={{ fontFamily: "var(--mono)", fontSize: 10 }}
                >
                  {m.action_link || "—"}
                </code>
                {m.action_link && <CopyLink text={m.action_link} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {hasErrors && (
        <div>
          <p className="label-text mb-10" style={{ color: "var(--warning)" }}>
            — Errors
          </p>
          <div className="hairline overflow-hidden">
            {result.errors.map((err, i) => (
              <div
                key={i}
                className={`px-14 py-10 flex items-baseline gap-10 ${
                  i < result.errors.length - 1 ? "hairline-b" : ""
                }`}
              >
                <span
                  className="mono-sm tnum text-text-dim shrink-0"
                  style={{ minWidth: 30 }}
                >
                  {err.row || "—"}
                </span>
                <span
                  className="mono-sm text-text-secondary shrink-0"
                  style={{ minWidth: 160 }}
                >
                  {err.email || "—"}
                </span>
                <span className="mono-sm text-[var(--warning)] flex-1">
                  {err.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * Tiny helpers
 * ============================================================ */

function ColumnRow({
  name,
  required,
  hint,
  last,
}: {
  name: string;
  required?: boolean;
  hint: string;
  last?: boolean;
}) {
  return (
    <div
      className={`px-14 py-10 flex items-center gap-14 ${
        last ? "" : "hairline-b"
      }`}
    >
      <code
        className="shrink-0"
        style={{
          fontFamily: "var(--mono)",
          fontSize: 12,
          color: "var(--text)",
          minWidth: 90,
        }}
      >
        {name}
      </code>
      <span
        className="label-text shrink-0"
        style={{
          color: required ? "var(--accent)" : "var(--text-dim)",
          minWidth: 64,
        }}
      >
        {required ? "Required" : "Optional"}
      </span>
      <span className="mono-sm text-text-muted">{hint}</span>
    </div>
  );
}

function CountChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <span className="flex items-baseline gap-4">
      <span
        className="tnum"
        style={{
          color,
          fontFamily: "var(--mono)",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        {value}
      </span>
      <span className="label-text" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
    </span>
  );
}

function CopyLink({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text)}
      className="hairline-subtle p-4 text-text-muted hover:text-text hover:border-[var(--border-hover)] transition-colors shrink-0"
      aria-label="Copy link"
      title="Copy link"
    >
      <Copy size={10} strokeWidth={1.5} />
    </button>
  );
}
