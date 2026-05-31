"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import { INTEGRATION_EVENTS, EVENT_META } from "@/lib/integrations/types";
import { createWebhookEndpoint, type CreateEndpointResult } from "./actions";

interface Props {
  onCancel: () => void;
  /** Called after successful creation with the plaintext secret. */
  onCreated: (secret: string, endpointName: string) => void;
}

export function EndpointForm({ onCancel, onCreated }: Props) {
  const [state, formAction, pending] = useActionState<
    CreateEndpointResult | undefined,
    FormData
  >(async (prev, formData) => {
    const result = await createWebhookEndpoint(prev, formData);
    if (result.secret && !result.error) {
      const name = String(formData.get("name") ?? "Endpoint");
      onCreated(result.secret, name);
    }
    return result;
  }, undefined);

  const [enabled, setEnabled] = useState<string[]>([]);

  const toggleEvent = (e: string) => {
    setEnabled((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]
    );
  };

  return (
    <form
      action={formAction}
      className="hairline bg-[var(--surface)] p-20 flex flex-col gap-16"
    >
      <header className="flex items-center justify-between">
        <p className="label-text--lg">— New endpoint</p>
        <button
          type="button"
          onClick={onCancel}
          className="text-text-muted hover:text-text transition-colors"
          aria-label="Cancel"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </header>

      <Input
        label="Name"
        name="name"
        type="text"
        required
        placeholder="e.g. Zapier — Order alerts"
        autoComplete="off"
      />

      <Input
        label="Endpoint URL"
        name="url"
        type="url"
        required
        placeholder="https://hooks.zapier.com/hooks/catch/..."
        autoComplete="off"
      />

      <div className="flex flex-col gap-10">
        <p className="label-text text-text-muted">Events</p>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {INTEGRATION_EVENTS.map((e) => {
            const meta = EVENT_META[e];
            const checked = enabled.includes(e);
            return (
              <li key={e}>
                <label
                  className={`flex items-start gap-10 cursor-pointer hairline-subtle px-12 py-10 transition-colors ${
                    checked
                      ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                      : "hover:border-[var(--border-hover)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="events"
                    value={e}
                    checked={checked}
                    onChange={() => toggleEvent(e)}
                    className="mt-2 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-text"
                      style={{
                        fontFamily: "var(--display)",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      {meta.label}
                    </p>
                    <p
                      className="mono-sm text-text-muted mt-2"
                      style={{ fontSize: 10, lineHeight: 1.5 }}
                    >
                      {meta.description}
                    </p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {state?.error && (
        <p
          role="alert"
          className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-12 py-10 mono-sm text-[var(--danger)] inline-flex items-start gap-8"
        >
          <AlertTriangle
            size={11}
            strokeWidth={1.5}
            className="mt-2 shrink-0"
          />
          <span>{state.error}</span>
        </p>
      )}

      <footer className="flex items-center gap-10 hairline-t pt-14">
        <CornerButton
          type="submit"
          variant="primary"
          size="sm"
          loading={pending}
          disabled={enabled.length === 0}
        >
          <Plus size={11} strokeWidth={1.5} />
          Create endpoint
        </CornerButton>
        <CornerButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
        >
          Cancel
        </CornerButton>
        <p className="mono-sm text-text-dim ml-auto" style={{ fontSize: 10 }}>
          You&apos;ll see the signing secret once after creation — copy it
          immediately.
        </p>
      </footer>
    </form>
  );
}
