"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormSection } from "@/components/ui/FormSection";
import { FormActions } from "@/components/ui/FormActions";
import { FormNotice } from "@/components/ui/FormNotice";
import { CornerButton } from "@/components/ui/CornerButton";
import { createApiKey } from "../actions";
/* Shared with the API routes that enforce them — see lib/apiScopes.ts. */
import { API_SCOPES as SCOPES } from "@/lib/apiScopes";

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
      <form ref={formRef} action={formAction}>
        <FormSection
          title="Create API key"
          description="Used by the mobile app, webhooks, or external integrations."
        >
          <Input
            label="Name"
            name="name"
            type="text"
            required
            placeholder="e.g. Mobile app"
          />

          <FormSection variant="plain" title="Scopes">
            <div className="grid grid-cols-2 gap-x-16 gap-y-8">
              {SCOPES.map((s) => (
                <Checkbox
                  key={s.id}
                  name="scopes"
                  value={s.id}
                  label={s.id}
                  description={s.label}
                />
              ))}
            </div>
          </FormSection>

          {state?.error && <FormNotice>{state.error}</FormNotice>}

          <FormActions>
            <CornerButton
              type="submit"
              variant="primary"
              size="sm"
              loading={pending}
            >
              Generate key →
            </CornerButton>
          </FormActions>
        </FormSection>
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
