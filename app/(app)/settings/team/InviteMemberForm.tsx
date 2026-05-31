"use client";

// TODO(stub): build the real team invite form. Should wire up a server action
// that invites a member to the given org (email + role), with success/error
// state via useActionState, mirroring app/(app)/settings/members/InviteForm.tsx.

interface Props {
  orgId: string;
}

export function InviteMemberForm({ orgId }: Props) {
  return (
    <form
      className="hairline bg-[var(--surface)] p-20 flex flex-col gap-16"
      data-org-id={orgId}
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
          Invite form not yet implemented.
        </p>
      </div>
    </form>
  );
}
