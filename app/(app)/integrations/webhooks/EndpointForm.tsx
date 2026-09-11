"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormSection } from "@/components/ui/FormSection";
import { FormActions } from "@/components/ui/FormActions";
import { FormNotice } from "@/components/ui/FormNotice";
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
    <form action={formAction}>
      <FormSection
        title="— New endpoint"
        action={
          <button
            type="button"
            onClick={onCancel}
            className="text-text-muted hover:text-text transition-colors"
            aria-label="Cancel"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        }
      >
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

        <FormSection variant="plain" title="Events">
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {INTEGRATION_EVENTS.map((e) => {
              const meta = EVENT_META[e];
              const checked = enabled.includes(e);
              return (
                <li key={e} className="flex">
                  <Checkbox
                    name="events"
                    value={e}
                    checked={checked}
                    onChange={() => toggleEvent(e)}
                    label={meta.label}
                    description={meta.description}
                    className={`flex-1 hairline-subtle px-12 py-10 transition-colors ${
                      checked
                        ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                        : "hover:border-[var(--border-hover)]"
                    }`}
                  />
                </li>
              );
            })}
          </ul>
        </FormSection>

        {state?.error && <FormNotice>{state.error}</FormNotice>}

        <FormActions
          status={
            <span className="text-text-dim" style={{ fontSize: 10 }}>
              You&apos;ll see the signing secret once after creation — copy it
              immediately.
            </span>
          }
        >
          <CornerButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
          >
            Cancel
          </CornerButton>
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
        </FormActions>
      </FormSection>
    </form>
  );
}
