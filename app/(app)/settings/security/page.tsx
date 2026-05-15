import { SectionTitle } from "@/components/ui/SectionTitle";
import { SecurityClient } from "./SecurityClient";
import { PasswordChangeForm } from "./PasswordChangeForm";

export const metadata = { title: "Security · Settings" };

export default function SecurityPage() {
  return (
    <div className="flex flex-col gap-40">
      <section aria-labelledby="password-heading">
        <SectionTitle eyebrow="Credentials" title="Password" />
        <PasswordChangeForm />
      </section>

      <section aria-labelledby="2fa-heading">
        <SectionTitle eyebrow="Sign-in" title="Two-factor authentication" />
        <SecurityClient />
      </section>

      <section aria-labelledby="sessions-heading">
        <SectionTitle eyebrow="Sessions" title="Active devices" />
        <div className="hairline bg-[var(--surface-2)] px-20 py-24">
          <p className="mono-sm text-text-muted">
            Device session listing is coming in a follow-up release. Until then,
            you can revoke any session by signing out — all sessions are tied to
            a single refresh token rotation.
          </p>
        </div>
      </section>
    </div>
  );
}
