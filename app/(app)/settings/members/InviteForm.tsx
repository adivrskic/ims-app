"use client";

import { useActionState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CornerButton } from "@/components/ui/CornerButton";
import { inviteMember } from "../actions";

export function InviteForm() {
  const [state, formAction, pending] = useActionState(inviteMember, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  // Reset form on success
  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
    }
  }, [state?.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="hairline bg-[var(--surface)] p-20 flex flex-col gap-16"
    >
      <div className="flex flex-col gap-4">
        <h3
          className="text-text"
          style={{
            fontFamily: "var(--display)",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Invite a teammate
        </h3>
        <p className="mono-sm text-text-muted">
          They&apos;ll receive an email link to join this workspace.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-12">
        <div className="flex-1">
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="teammate@company.com"
          />
        </div>
        <div className="md:w-[180px]">
          <Select
            label="Role"
            name="role"
            defaultValue="member"
            ariaLabel="Role"
            options={[
              { value: "member", label: "Member" },
              { value: "admin", label: "Admin" },
            ]}
          />
        </div>
      </div>

      {state?.error && (
        <p
          role="alert"
          className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-12 py-10 mono-sm text-[var(--danger)]"
        >
          {state.error}
        </p>
      )}
      {state?.success && (
        <p
          role="status"
          className="hairline-subtle border-[rgba(34,197,94,0.45)] bg-[var(--success-dim)] px-12 py-10 mono-sm text-[var(--success)]"
        >
          {state.success}
        </p>
      )}

      <div className="flex justify-end">
        <CornerButton
          type="submit"
          variant="primary"
          size="sm"
          loading={pending}
        >
          Send invite →
        </CornerButton>
      </div>
    </form>
  );
}
