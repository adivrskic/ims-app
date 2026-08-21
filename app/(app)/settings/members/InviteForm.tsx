"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CornerButton } from "@/components/ui/CornerButton";
import { inviteMember } from "../actions";

export function InviteForm() {
  const [state, formAction, pending] = useActionState(inviteMember, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [copied, setCopied] = useState(false);

  /* Present only when the invite row was created but the email failed to
     send. The link is the admin's only way to complete the invite, so it
     has to be visible and copy-able rather than merely alluded to. */
  const fallbackUrl =
    state && "inviteUrl" in state ? (state.inviteUrl as string) : null;

  const copyLink = async () => {
    if (!fallbackUrl) return;
    try {
      await navigator.clipboard.writeText(fallbackUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — the input below is still selectable.
    }
  };

  // Reset form on success
  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setCopied(false);
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
        <div
          role="status"
          className={`hairline-subtle px-12 py-10 mono-sm flex flex-col gap-10 ${
            fallbackUrl
              ? "border-[rgba(212,168,83,0.45)] bg-[var(--accent-dim)] text-[var(--accent)]"
              : "border-[rgba(34,197,94,0.45)] bg-[var(--success-dim)] text-[var(--success)]"
          }`}
        >
          <span>{state.success}</span>
          {fallbackUrl && (
            <div className="flex gap-8 items-center">
              <input
                readOnly
                value={fallbackUrl}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Invite link"
                className="flex-1 hairline-subtle bg-[var(--surface)] px-10 py-8 mono-sm text-text"
              />
              <CornerButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={copyLink}
              >
                {copied ? (
                  <Check size={13} strokeWidth={1.5} />
                ) : (
                  <Copy size={13} strokeWidth={1.5} />
                )}
                {copied ? "Copied" : "Copy"}
              </CornerButton>
            </div>
          )}
        </div>
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
