"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { CornerButton } from "@/components/ui/CornerButton";
import { sendPasswordReset } from "../actions";

export default function ForgotPage() {
  const [state, formAction, pending] = useActionState(
    sendPasswordReset,
    undefined
  );

  return (
    <div className="flex flex-col gap-28">
      <div>
        <h1 className="heading-sm mb-10">Reset password</h1>
        <p className="mono-sm text-text-muted">
          Enter your email and we&apos;ll send a reset link.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-12">
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />

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

        <CornerButton
          type="submit"
          variant="primary"
          loading={pending}
          fullWidth
        >
          Send reset link
        </CornerButton>
      </form>

      <div className="hairline-t pt-20 mt-4">
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
