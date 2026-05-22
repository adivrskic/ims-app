"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { CornerButton } from "@/components/ui/CornerButton";
import {
  createAdditionalWorkspace,
  type AdditionalWorkspaceState,
} from "./actions";

interface Props {
  email: string;
}

/**
 * Slimmer cousin of OnboardingForm. Same shape (workspace name + first
 * facility + optional invites) but assumes the user is already
 * authenticated and a member of at least one org. The server action
 * (`createAdditionalWorkspace`) skips the idempotence check that
 * `setUpWorkspace` runs.
 */
export function NewWorkspaceForm({ email }: Props) {
  const [state, formAction, pending] = useActionState<
    AdditionalWorkspaceState | undefined,
    FormData
  >(createAdditionalWorkspace, undefined);

  const [workspaceName, setWorkspaceName] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [inviteEmails, setInviteEmails] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-24">
      {/* ── Workspace name ────────────────────────────────────── */}
      <section
        className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16"
        aria-labelledby="ws"
      >
        <header className="flex items-baseline justify-between gap-12">
          <p id="ws" className="label-text--lg">
            01 · Workspace
          </p>
          <span className="mono-sm text-text-dim">Required</span>
        </header>
        <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
          Pick a clear name — your team will see this everywhere. Renamable
          later from Settings.
        </p>
        <Input
          label="Workspace name"
          name="workspace_name"
          type="text"
          required
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          placeholder="Acme — East Coast"
          autoComplete="organization"
        />
      </section>

      {/* ── First facility ────────────────────────────────────── */}
      <section
        className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16"
        aria-labelledby="fac"
      >
        <header className="flex items-baseline justify-between gap-12">
          <p id="fac" className="label-text--lg">
            02 · First facility
          </p>
          <span className="mono-sm text-text-dim">Required</span>
        </header>
        <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
          A facility is one physical location — a warehouse, store, or install
          yard. Add more from the Facilities page later.
        </p>
        <Input
          label="Facility name"
          name="facility_name"
          type="text"
          required
          value={facilityName}
          onChange={(e) => setFacilityName(e.target.value)}
          placeholder="Main warehouse"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <Input
            label="City"
            name="facility_city"
            type="text"
            placeholder="Atlanta"
            autoComplete="address-level2"
          />
          <Input
            label="State"
            name="facility_state"
            type="text"
            placeholder="GA"
            autoComplete="address-level1"
          />
          <Input
            label="ZIP"
            name="facility_zip"
            type="text"
            placeholder="30309"
            autoComplete="postal-code"
          />
        </div>
      </section>

      {/* ── Optional teammates ────────────────────────────────── */}
      <section
        className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16"
        aria-labelledby="team"
      >
        <header className="flex items-baseline justify-between gap-12">
          <p id="team" className="label-text--lg">
            03 · Invite teammates
          </p>
          <span className="mono-sm text-text-dim">Optional</span>
        </header>
        <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
          Comma-separated email addresses. Each person gets a unique join link.
          You can invite more anytime from Settings → Members.
        </p>
        <Input
          label="Teammate emails"
          name="invite_emails"
          type="text"
          value={inviteEmails}
          onChange={(e) => setInviteEmails(e.target.value)}
          placeholder="ops@acme.com, lead@acme.com"
        />
      </section>

      {/* ── Feedback ──────────────────────────────────────────── */}
      {state?.error && (
        <p
          role="alert"
          className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-14 py-12 mono-sm text-[var(--danger)] inline-flex items-start gap-8"
        >
          <AlertTriangle
            size={11}
            strokeWidth={1.5}
            className="mt-2 shrink-0"
          />
          <span>{state.error}</span>
        </p>
      )}

      {/* ── Submit ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-14 flex-wrap">
        <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
          Signed in as <span className="text-text-muted">{email}</span> ·
          you&apos;ll be the owner of the new workspace.
        </p>
        <CornerButton
          type="submit"
          variant="primary"
          loading={pending}
          disabled={!workspaceName.trim() || !facilityName.trim()}
        >
          Create workspace
          <ArrowRight size={11} strokeWidth={1.5} />
        </CornerButton>
      </div>
    </form>
  );
}
