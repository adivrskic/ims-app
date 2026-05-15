"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { CornerButton } from "@/components/ui/CornerButton";
import { createApiKey } from "../actions";

const SCOPES = [
  { id: "scan:read", label: "Read scans" },
  { id: "scan:write", label: "Log scans" },
  { id: "product:read", label: "Read products" },
  { id: "product:write", label: "Manage products" },
  { id: "location:read", label: "Read locations" },
  { id: "location:write", label: "Place inventory" },
  { id: "order:read", label: "Read orders" },
  { id: "order:write", label: "Manage orders" },
];

export function CreateKeyForm() {
  const [state, formAction, pending] = useActionState(createApiKey, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state?.success && state.token) {
      formRef.current?.reset();
    }
  }, [state?.success, state]);

  const copyToken = async () => {
    if (!state?.token) return;
    try {
      await navigator.clipboard.writeText(state.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        className="hairline bg-[var(--surface)] p-20 flex flex-col gap-16"
      >
        <div>
          <h3
            className="text-text"
            style={{
              fontFamily: "var(--display)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Create API key
          </h3>
          <p className="mono-sm text-text-muted mt-4">
            Used by the mobile app, webhooks, or external integrations.
          </p>
        </div>

        <Input
          label="Name"
          name="name"
          type="text"
          required
          placeholder="e.g. Mobile app"
        />

        <fieldset className="flex flex-col gap-8">
          <legend className="label-text mb-4">Scopes</legend>
          <div className="grid grid-cols-2 gap-x-16 gap-y-8">
            {SCOPES.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-8 cursor-pointer hover:text-text text-text-secondary transition-colors"
              >
                <input
                  type="checkbox"
                  name="scopes"
                  value={s.id}
                  className="appearance-none w-12 h-12 hairline-subtle bg-[var(--surface-2)] checked:bg-[var(--accent)] checked:border-[var(--accent)] cursor-pointer"
                  style={{ display: "inline-block" }}
                />
                <span className="mono-sm">{s.id}</span>
                <span className="label-text text-text-dim">{s.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {state?.error && (
          <p
            role="alert"
            className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-12 py-10 mono-sm text-[var(--danger)]"
          >
            {state.error}
          </p>
        )}

        <div className="flex justify-end">
          <CornerButton
            type="submit"
            variant="primary"
            size="sm"
            loading={pending}
          >
            Generate key →
          </CornerButton>
        </div>
      </form>

      {state?.success && state.token && (
        <div
          role="status"
          className="hairline border-[var(--accent-soft)] bg-[var(--accent-dim)] p-20 flex flex-col gap-12"
        >
          <div className="flex items-baseline justify-between gap-12">
            <p
              className="text-[var(--accent)]"
              style={{
                fontFamily: "var(--display)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              New key generated — copy it now
            </p>
            <p className="label-text text-text-muted">Shown once</p>
          </div>
          <p className="mono-sm text-text-secondary">
            For security, the full token is only displayed at creation. Copy it
            into your environment before navigating away.
          </p>
          <div className="hairline bg-[var(--bg)] px-12 py-10 flex items-center gap-10 overflow-hidden">
            <code
              className="flex-1 text-text truncate"
              style={{ fontFamily: "var(--mono)", fontSize: 12 }}
            >
              {state.token}
            </code>
            <button
              type="button"
              onClick={copyToken}
              className="shrink-0 hairline-subtle px-10 py-5 hover:border-[var(--accent)] text-text-muted hover:text-[var(--accent)] inline-flex items-center gap-6 transition-colors"
              aria-label="Copy token"
            >
              {copied ? (
                <Check size={11} strokeWidth={1.5} />
              ) : (
                <Copy size={11} strokeWidth={1.5} />
              )}
              <span className="label-text">{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
