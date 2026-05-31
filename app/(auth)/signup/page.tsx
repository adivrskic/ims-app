"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ManifestHeader } from "@/components/auth/ManifestHeader";
import { ManifestRow } from "@/components/auth/ManifestRow";
import { ManifestInput } from "@/components/auth/ManifestInput";
import { ManifestPasswordField } from "@/components/auth/ManifestPasswordField";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { CornerButton } from "@/components/ui/CornerButton";
import { signUpWithPassword } from "../actions";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(
    signUpWithPassword,
    undefined
  );

  const [password, setPassword] = useState("");

  return (
    <div className="flex flex-col">
      <ManifestHeader eyebrow="New operator" />

      <h1
        style={{
          fontFamily: "var(--display)",
          fontSize: 30,
          fontWeight: 500,
          lineHeight: 1.1,
          letterSpacing: "-0.5px",
          margin: "0 0 28px",
          color: "var(--text)",
        }}
      >
        Request <em className="accent-italic">access</em>.
      </h1>

      <form action={formAction} className="hairline-t">
        <ManifestRow number="01" label="Full name">
          <ManifestInput
            type="text"
            name="full_name"
            autoComplete="name"
            placeholder="Operator name"
          />
        </ManifestRow>

        <ManifestRow number="02" label="Work email">
          <ManifestInput
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="ops@nautilusinventory.com"
          />
        </ManifestRow>

        <ManifestRow
          number="03"
          label="Passcode"
          rightSlot={
            <span className="mono-sm" style={{ color: "var(--text-dim)" }}>
              8+ characters
            </span>
          }
        >
          <ManifestPasswordField
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </ManifestRow>

        {/* Strength meter only renders once the user has started typing,
            keeping the form quiet until it has something to say. */}
        {password.length > 0 && (
          <div className="py-14 hairline-b">
            <PasswordStrength password={password} />
          </div>
        )}

        {state?.error && (
          <div className="py-12 hairline-b">
            <p
              role="alert"
              className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-12 py-10 mono-sm text-[var(--danger)]"
            >
              {state.error}
            </p>
          </div>
        )}

        {state?.success && (
          <div className="py-12 hairline-b">
            <p
              role="status"
              className="hairline-subtle border-[rgba(34,197,94,0.45)] bg-[var(--success-dim)] px-12 py-10 mono-sm text-[var(--success)]"
            >
              {state.success}
            </p>
          </div>
        )}

        <ManifestRow number="04" noBorder>
          <CornerButton
            type="submit"
            variant="primary"
            loading={pending}
            fullWidth
          >
            Submit request →
          </CornerButton>
        </ManifestRow>
      </form>

      <div className="hairline-t mt-24 pt-16 flex justify-between">
        <Link
          href="/login"
          className="mono-sm text-text-muted hover:text-text transition-colors"
        >
          ← Back to sign in
        </Link>
        <span className="mono-sm" style={{ color: "var(--text-dim)" }}>
          Verification email to follow
        </span>
      </div>
    </div>
  );
}
