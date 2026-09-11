"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ManifestHeader } from "@/components/auth/ManifestHeader";
import { ManifestRow } from "@/components/auth/ManifestRow";
import { ManifestInput } from "@/components/auth/ManifestInput";
import { CornerButton } from "@/components/ui/CornerButton";
import { FormNotice } from "@/components/ui/FormNotice";
import { sendPasswordReset } from "../actions";

export default function ForgotPage() {
  const [state, formAction, pending] = useActionState(
    sendPasswordReset,
    undefined
  );

  return (
    <div className="flex flex-col">
      <ManifestHeader eyebrow="Reset request" />

      <h1
        style={{
          fontFamily: "var(--display)",
          fontSize: 30,
          fontWeight: 500,
          lineHeight: 1.1,
          letterSpacing: "-0.5px",
          margin: "0 0 12px",
          color: "var(--text)",
        }}
      >
        Reset your <em className="accent-italic">passcode</em>.
      </h1>
      <p
        className="mono-sm"
        style={{
          color: "var(--text-muted)",
          lineHeight: 1.6,
          margin: "0 0 28px",
        }}
      >
        Enter the email on file. We'll send a reset link if the account exists.
      </p>

      <form action={formAction}>
        <ManifestRow number="01" label="Email address">
          <ManifestInput
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="ops@Nautilus.io"
          />
        </ManifestRow>

        {state?.error && (
          <div className="py-12">
            <FormNotice>{state.error}</FormNotice>
          </div>
        )}

        {state?.success && (
          <div className="py-12">
            <FormNotice tone="success">{state.success}</FormNotice>
          </div>
        )}

        <ManifestRow number="02" noBorder>
          <CornerButton
            type="submit"
            variant="primary"
            loading={pending}
            fullWidth
          >
            Send reset link →
          </CornerButton>
        </ManifestRow>
      </form>

      <div className="mt-24 pt-16">
        <Link
          href="/login"
          className="mono-sm text-text-muted hover:text-text transition-colors"
        >
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
