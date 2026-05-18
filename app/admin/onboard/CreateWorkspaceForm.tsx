"use client";

import { useActionState, useRef } from "react";
import { Plus, Check, AlertCircle, Copy } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Select } from "@/components/ui/Select";
import { createWorkspace, type OnboardResult } from "./actions";

const TIER_OPTIONS = [
  { value: "starter", label: "Starter — default plan" },
  { value: "pro", label: "Pro — multi-facility + integrations" },
  { value: "enterprise", label: "Enterprise — unlimited + SLA" },
];

export function CreateWorkspaceForm() {
  const [state, formAction, pending] = useActionState<
    OnboardResult | undefined,
    FormData
  >(createWorkspace, undefined);

  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section aria-labelledby="onboard-form" className="flex flex-col gap-20">
      <form
        ref={formRef}
        action={formAction}
        className="hairline bg-[var(--surface)] flex flex-col"
      >
        <FieldRow number="01" label="Workspace name">
          <input
            type="text"
            name="name"
            required
            placeholder="Acme Flooring Supply"
            className="w-full bg-transparent outline-none text-text mono-body"
            style={{ fontSize: 14 }}
          />
        </FieldRow>

        <FieldRow number="02" label="Plan tier">
          <Select name="tier" defaultValue="starter" options={TIER_OPTIONS} />
        </FieldRow>

        <FieldRow number="03" label="Owner email">
          <input
            type="email"
            name="owner_email"
            required
            placeholder="owner@client-domain.com"
            className="w-full bg-transparent outline-none text-text mono-body"
            style={{ fontSize: 14 }}
          />
        </FieldRow>

        <FieldRow number="04" label="Owner full name">
          <input
            type="text"
            name="owner_full_name"
            required
            placeholder="Jane Operator"
            className="w-full bg-transparent outline-none text-text mono-body"
            style={{ fontSize: 14 }}
          />
        </FieldRow>

        <FieldRow number="05" label="Internal notes" noBorder>
          <textarea
            name="notes"
            rows={2}
            placeholder="Optional — context for the CS handoff"
            className="w-full bg-transparent outline-none text-text mono-body resize-none"
            style={{ fontSize: 13, lineHeight: 1.6 }}
          />
        </FieldRow>

        <div className="px-20 py-16 hairline-t flex items-center justify-between gap-14">
          <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
            The owner receives a magic-link email. They'll set their password on
            first sign-in.
          </p>
          <CornerButton
            type="submit"
            variant="primary"
            size="sm"
            loading={pending}
          >
            <Plus size={11} strokeWidth={1.5} />
            Create workspace
          </CornerButton>
        </div>
      </form>

      {state && (
        <ResultPanel
          result={state}
          onReset={() => {
            formRef.current?.reset();
          }}
        />
      )}
    </section>
  );
}

function FieldRow({
  number,
  label,
  children,
  noBorder,
}: {
  number: string;
  label: string;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div
      className={`px-20 py-14 ${
        noBorder ? "" : "hairline-b"
      } flex items-start gap-14`}
    >
      <div className="shrink-0 flex flex-col gap-2 w-[110px] pt-2">
        <span
          className="mono-sm tnum"
          style={{
            color: "var(--text-dim)",
            letterSpacing: "1px",
            fontSize: 10,
          }}
        >
          {number}
        </span>
        <span className="label-text" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function ResultPanel({
  result,
  onReset,
}: {
  result: OnboardResult;
  onReset: () => void;
}) {
  if (result.error) {
    return (
      <div className="hairline bg-[var(--surface)] p-20 flex items-start gap-14">
        <span
          className="w-32 h-32 hairline-subtle bg-[var(--danger-dim)] flex items-center justify-center text-[var(--danger)] shrink-0"
          aria-hidden
        >
          <AlertCircle size={14} strokeWidth={1.5} />
        </span>
        <div className="flex-1">
          <p className="label-text mb-4" style={{ color: "var(--danger)" }}>
            Could not create workspace
          </p>
          <p
            className="mono-sm text-text-secondary"
            style={{ lineHeight: 1.6 }}
          >
            {result.error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="hairline bg-[var(--surface)] p-20 flex flex-col gap-14">
      <header className="flex items-start gap-14">
        <span
          className="w-32 h-32 hairline-subtle bg-[var(--success-dim)] flex items-center justify-center text-[var(--success)] shrink-0"
          aria-hidden
        >
          <Check size={14} strokeWidth={1.5} />
        </span>
        <div className="flex-1">
          <p className="label-text mb-4" style={{ color: "var(--success)" }}>
            Workspace created
          </p>
          <p
            className="text-text"
            style={{
              fontFamily: "var(--display)",
              fontSize: 15,
              fontWeight: 500,
            }}
          >
            {result.workspace_name}
          </p>
          <p className="mono-sm text-text-muted">
            Invitation sent to{" "}
            <span className="text-text-secondary">{result.owner_email}</span>
          </p>
        </div>
      </header>

      {result.magic_link_url && (
        <div className="hairline-t pt-14">
          <p className="label-text mb-8" style={{ color: "var(--text-muted)" }}>
            — Magic link (if the email gets stuck)
          </p>
          <div className="hairline-subtle bg-[var(--surface-2)] px-12 py-10 flex items-center gap-10 overflow-hidden">
            <code
              className="flex-1 min-w-0 truncate text-text-secondary"
              style={{ fontFamily: "var(--mono)", fontSize: 11 }}
            >
              {result.magic_link_url}
            </code>
            <CopyButton text={result.magic_link_url} />
          </div>
        </div>
      )}

      <footer className="hairline-t pt-14 flex items-center gap-10">
        <CornerButton type="button" variant="ghost" size="sm" onClick={onReset}>
          Onboard another
        </CornerButton>
      </footer>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
      }}
      className="hairline-subtle p-6 text-text-muted hover:text-text hover:border-[var(--border-hover)] transition-colors shrink-0"
      aria-label="Copy magic link"
      title="Copy magic link"
    >
      <Copy size={11} strokeWidth={1.5} />
    </button>
  );
}
