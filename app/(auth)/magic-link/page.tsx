"use client";

import { useActionState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ManifestHeader } from "@/components/auth/ManifestHeader";
import { ManifestRow } from "@/components/auth/ManifestRow";
import { ManifestInput } from "@/components/auth/ManifestInput";
import { CornerButton } from "@/components/ui/CornerButton";
import { sendMagicLink } from "../actions";

function MagicLinkInner() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";

  const [state, formAction, pending] = useActionState(sendMagicLink, undefined);

  return (
    <div className="flex flex-col">
      <ManifestHeader eyebrow="Sign-in link" />

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
        Email me a sign-in <em className="accent-italic">link</em>.
      </h1>
      <p
        className="mono-sm"
        style={{
          color: "var(--text-muted)",
          lineHeight: 1.6,
          margin: "0 0 28px",
        }}
      >
        We'll send a one-time link to your inbox. Clicking it signs you in
        without a password.
      </p>

      <form action={formAction} className="hairline-t">
        <input type="hidden" name="next" value={next} />

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

        <ManifestRow number="02" noBorder>
          <CornerButton
            type="submit"
            variant="primary"
            loading={pending}
            fullWidth
          >
            Send link →
          </CornerButton>
        </ManifestRow>
      </form>

      <div className="hairline-t mt-24 pt-16">
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

export default function MagicLinkPage() {
  return (
    <Suspense fallback={null}>
      <MagicLinkInner />
    </Suspense>
  );
}
