"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CornerButton } from "@/components/ui/CornerButton";
import { FormSection } from "@/components/ui/FormSection";
import { FormActions } from "@/components/ui/FormActions";
import { FormNotice } from "@/components/ui/FormNotice";
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
    <form ref={formRef} action={formAction}>
      <FormSection
        title="Invite a teammate"
        description="They’ll receive an email link to join this workspace."
      >
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

      {state?.error && <FormNotice>{state.error}</FormNotice>}
      {state?.success && (
        <FormNotice tone={fallbackUrl ? "accent" : "success"}>
          <div className="flex flex-col gap-10">
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
        </FormNotice>
      )}

      <FormActions>
        <CornerButton
          type="submit"
          variant="primary"
          size="sm"
          loading={pending}
        >
          Send invite →
        </CornerButton>
      </FormActions>
      </FormSection>
    </form>
  );
}
