"use client";

import { useTransition } from "react";
import { Inbox, Check, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { CornerButton } from "@/components/ui/CornerButton";
import { acceptInvite } from "./actions";

interface Props {
  token: string;
  orgName: string;
  role: string;
}

export function InviteAcceptClient({ token, orgName, role }: Props) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const handleAccept = () => {
    setErr(null);
    startTransition(async () => {
      const result = await acceptInvite(token);
      if (result?.error) {
        setErr(result.error);
      }
      // Success path: server action calls redirect(), which throws and
      // navigates — no further client work needed.
    });
  };

  return (
    <>
      <header className="flex items-start gap-14">
        <span
          className="w-40 h-40 hairline-subtle bg-[var(--accent-dim)] flex items-center justify-center text-[var(--accent)] shrink-0"
          aria-hidden
        >
          <Inbox size={16} strokeWidth={1.5} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="label-text mb-4 text-text-muted">
            You&apos;ve been invited
          </p>
          <h1
            style={{
              fontFamily: "var(--display)",
              fontSize: 22,
              fontWeight: 500,
              color: "var(--text)",
              margin: "0 0 8px",
            }}
          >
            Join <em className="accent-italic">{orgName}</em>
          </h1>
          <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
            You&apos;ll join as a {role}. You can leave anytime from your
            account settings.
          </p>
        </div>
      </header>

      {err && (
        <p
          role="alert"
          className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-12 py-10 mono-sm text-[var(--danger)] inline-flex items-start gap-8"
        >
          <AlertTriangle
            size={11}
            strokeWidth={1.5}
            className="mt-2 shrink-0"
          />
          <span>{err}</span>
        </p>
      )}

      <footer className="hairline-t pt-16 flex items-center gap-10">
        <CornerButton
          type="button"
          variant="primary"
          onClick={handleAccept}
          loading={pending}
          disabled={pending}
        >
          <Check size={11} strokeWidth={1.5} />
          Accept invite
        </CornerButton>
        <span className="mono-sm text-text-dim">
          You&apos;ll be redirected immediately
        </span>
      </footer>
    </>
  );
}
