"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { CornerButton } from "@/components/ui/CornerButton";
import { signUpWithPassword } from "../actions";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(
    signUpWithPassword,
    undefined
  );

  return (
    <div className="flex flex-col gap-28">
      <h1 className="heading-sm">Create account</h1>

      <form action={formAction} className="flex flex-col gap-12">
        <Input
          label="Full name"
          name="full_name"
          type="text"
          autoComplete="name"
        />
        <Input
          label="Work email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="At least 8 characters."
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
          Create account
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
