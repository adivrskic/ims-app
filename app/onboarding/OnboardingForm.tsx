"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import { AddressFields } from "@/components/ui/AddressFields";
import { InviteLinks } from "@/components/invites/InviteLinks";
import { setUpWorkspace, type OnboardingState } from "./actions";

interface Props {
  fullName: string | null;
  email: string;
}

export function OnboardingForm({ fullName, email }: Props) {
  const [state, formAction, pending] = useActionState<
    OnboardingState | undefined,
    FormData
  >(setUpWorkspace, undefined);

  const [workspaceName, setWorkspaceName] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [inviteEmails, setInviteEmails] = useState("");

  const firstName = fullName?.split(" ")[0] ?? "there";

  // Workspace created with pending invites → show the share-links panel
  // instead of the form. (No invites → the action redirects to "/".)
  if (state?.invites?.length) {
    return <InviteLinks invites={state.invites} />;
  }

  return (
    <div className="flex flex-col gap-32">
      {/* Greeting */}
      <div className="flex flex-col gap-12">
        <span className="label-text text-text-muted">
          — Welcome, {firstName}
        </span>
        <h1
          style={{
            fontFamily: "var(--display)",
            fontSize: 34,
            fontWeight: 500,
            lineHeight: 1.05,
            letterSpacing: "-0.5px",
            margin: 0,
            color: "var(--text)",
          }}
        >
          Set up your <em className="accent-italic">workspace</em>.
        </h1>
        <p
          className="mono-sm"
          style={{
            color: "var(--text-muted)",
            lineHeight: 1.6,
            maxWidth: 520,
          }}
        >
          A workspace holds your facilities, inventory, and team. You can add
          more facilities and invite teammates anytime — these are just the
          essentials to get you scanning today.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-32">
        {/* ── Workspace ─────────────────────────────────────── */}
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
            What should we call your company? Pick anything — you can rename
            later from Settings.
          </p>
          <Input
            label="Workspace name"
            name="workspace_name"
            type="text"
            required
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="Acme Flooring Supply"
            autoComplete="organization"
          />
        </section>

        {/* ── First facility ────────────────────────────────── */}
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
            yard. Inventory lives at facilities. Most teams start with one and
            add more later.
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
          <AddressFields namePrefix="facility" />
        </section>

        {/* ── Optional teammates ────────────────────────────── */}
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
            Comma-separated email addresses. We&apos;ll create pending invites;
            each person receives a unique link to join. You can also invite
            people anytime from Settings → Members.
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

        {/* Feedback */}
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

        {/* Submit */}
        <div className="flex items-center justify-between gap-14 flex-wrap">
          <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
            Signed in as <span className="text-text-muted">{email}</span> ·
            you&apos;ll be the workspace owner.
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
    </div>
  );
}
