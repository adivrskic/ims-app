import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { ArrowLeft } from "lucide-react";
import { CreateWorkspaceForm } from "./CreateWorkspaceForm";

export const metadata = { title: "Onboard client · Staff" };

export default async function OnboardPage() {
  return (
    <div className="flex flex-col gap-32">
      <div className="flex flex-col gap-12">
        <Link
          href="/admin"
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors w-fit"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text">All workspaces</span>
        </Link>
        <PageHeader
          eyebrow="Staff"
          title="Onboard a client"
          description="Provision a workspace and invite the first owner. They'll receive an email with a magic link to set their password and sign in."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-40">
        <CreateWorkspaceForm />

        <aside className="flex flex-col gap-20">
          <div>
            <p
              className="label-text mb-12"
              style={{ color: "var(--text-muted)" }}
            >
              — On submit
            </p>
            <ol className="flex flex-col gap-10 mono-sm text-text-secondary">
              <ChecklistItem n="01">
                Organization created with chosen tier
              </ChecklistItem>
              <ChecklistItem n="02">
                Owner account created via Supabase admin API
              </ChecklistItem>
              <ChecklistItem n="03">
                Profile + org_member (role: owner) rows inserted
              </ChecklistItem>
              <ChecklistItem n="04">
                Magic-link invitation email sent to owner
              </ChecklistItem>
              <ChecklistItem n="05">
                Onboarded-by + onboarded-at logged on the org
              </ChecklistItem>
            </ol>
          </div>

          <div className="hairline-t pt-16">
            <p
              className="label-text mb-8"
              style={{ color: "var(--text-muted)" }}
            >
              — Tier guide
            </p>
            <dl className="flex flex-col gap-10 mono-sm">
              <Tier label="Starter">
                Up to 2 facilities, 1k SKUs, basic integrations. Default for
                self-signups.
              </Tier>
              <Tier label="Pro">
                Up to 10 facilities, 25k SKUs, all integrations, scan-history
                exports.
              </Tier>
              <Tier label="Enterprise">
                Unlimited. Custom SLAs. Dedicated CS contact. Reach out before
                using.
              </Tier>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ChecklistItem({
  n,
  children,
}: {
  n: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-baseline gap-10">
      <span
        className="tnum shrink-0"
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: "var(--text-dim)",
          letterSpacing: "1px",
        }}
      >
        {n}
      </span>
      <span style={{ lineHeight: 1.6 }}>{children}</span>
    </li>
  );
}

function Tier({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt
        className="text-text"
        style={{
          fontFamily: "var(--display)",
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 2,
        }}
      >
        {label}
      </dt>
      <dd className="text-text-muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
        {children}
      </dd>
    </div>
  );
}
