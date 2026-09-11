"use client";

import { useActionState, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { CornerButton } from "@/components/ui/CornerButton";
import { AddressFields } from "@/components/ui/AddressFields";
import { FormSection } from "@/components/ui/FormSection";
import { FormActions } from "@/components/ui/FormActions";
import { FormNotice } from "@/components/ui/FormNotice";
import { InviteLinks } from "@/components/invites/InviteLinks";
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

  // Workspace created with pending invites → show the share-links panel
  // instead of the form. (No invites → the action redirects to "/".)
  if (state?.invites?.length) {
    return <InviteLinks invites={state.invites} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-24">
      {/* ── Workspace name ────────────────────────────────────── */}
      <FormSection
        title="01 · Workspace"
        description="Pick a clear name — your team will see this everywhere. Renamable later from Settings."
        action={<span className="mono-sm text-text-dim">Required</span>}
      >
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
      </FormSection>

      {/* ── First facility ────────────────────────────────────── */}
      <FormSection
        title="02 · First facility"
        description="A facility is one physical location — a warehouse, store, or install yard. Add more from the Facilities page later."
        action={<span className="mono-sm text-text-dim">Required</span>}
      >
        <Input
          label="Facility name"
          name="facility_name"
          type="text"
          required
          value={facilityName}
          onChange={(e) => setFacilityName(e.target.value)}
          placeholder="Main warehouse"
        />
        <AddressFields namePrefix="facility" />
      </FormSection>

      {/* ── Optional teammates ────────────────────────────────── */}
      <FormSection
        title="03 · Invite teammates"
        description="Comma-separated email addresses. Each person gets a unique join link. You can invite more anytime from Settings → Members."
        action={<span className="mono-sm text-text-dim">Optional</span>}
      >
        <Input
          label="Teammate emails"
          name="invite_emails"
          type="text"
          value={inviteEmails}
          onChange={(e) => setInviteEmails(e.target.value)}
          placeholder="ops@acme.com, lead@acme.com"
        />
      </FormSection>

      {/* ── Feedback ──────────────────────────────────────────── */}
      {state?.error && <FormNotice>{state.error}</FormNotice>}

      {/* ── Submit ────────────────────────────────────────────── */}
      <FormActions
        status={
          <span className="text-text-dim" style={{ lineHeight: 1.6 }}>
            Signed in as <span className="text-text-muted">{email}</span> ·
            you&apos;ll be the owner of the new workspace.
          </span>
        }
      >
        <CornerButton
          type="submit"
          variant="primary"
          loading={pending}
          disabled={!workspaceName.trim() || !facilityName.trim()}
        >
          Create workspace
          <ArrowRight size={11} strokeWidth={1.5} />
        </CornerButton>
      </FormActions>
    </form>
  );
}
