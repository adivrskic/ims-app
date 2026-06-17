import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Badge } from "@/components/ui/Badge";
import { KpiCard } from "@/components/ui/KpiCard";

export const metadata = { title: "Workspace · Staff" };

const TIER_TONE: Record<string, "neutral" | "info" | "accent"> = {
  starter: "neutral",
  pro: "info",
  enterprise: "accent",
};

const ROLE_TONE: Record<string, "neutral" | "info" | "accent" | "warning"> = {
  owner: "accent",
  admin: "info",
  member: "neutral",
  viewer: "warning",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Staff-only workspace detail. The /admin layout already gates this behind
 * getStaffUser(), so every query here uses the service-role client to read
 * across the org boundary. Read-only: members, activity, and basic billing
 * fields (the billing integration itself is not yet wired).
 */
export default async function AdminWorkspaceDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: org } = await admin
    .from("orgs")
    .select(
      "id, name, slug, tier, created_at, onboarded_at, stripe_customer_id, stripe_subscription_id"
    )
    .eq("id", id)
    .maybeSingle();
  if (!org) notFound();

  const [
    { data: members },
    { count: facilityCount },
    { count: productCount },
    { count: orderCount },
    { count: scans30d },
  ] = await Promise.all([
    admin
      .from("org_members")
      .select("user_id, role, joined_at, profile:profiles ( email, full_name )")
      .eq("org_id", id)
      .order("joined_at", { ascending: true }),
    admin
      .from("warehouses")
      .select("id", { count: "exact", head: true })
      .eq("org_id", id),
    admin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("org_id", id),
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("org_id", id),
    admin
      .from("scan_history")
      .select("id", { count: "exact", head: true })
      .eq("org_id", id)
      .gte(
        "scanned_at",
        new Date(Date.now() - 30 * 86_400_000).toISOString()
      ),
  ]);

  type MemberRow = {
    user_id: string;
    role: string;
    joined_at: string | null;
    profile:
      | { email: string | null; full_name: string | null }
      | { email: string | null; full_name: string | null }[]
      | null;
  };
  const memberRows = (members ?? []) as MemberRow[];

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Staff · Workspace"
        title={org.name}
        description={org.slug}
        backHref="/admin"
        backLabel="All workspaces"
        actions={
          <>
            <Badge tone={TIER_TONE[org.tier] ?? "neutral"} variant="filled">
              {org.tier}
            </Badge>
            <span className="mono-sm text-text-dim">
              {org.onboarded_at
                ? `Onboarded ${fmtDate(org.onboarded_at)}`
                : "Self-signup"}
            </span>
          </>
        }
      />

      <section>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-16">
          <KpiCard label="Members" value={String(memberRows.length)} />
          <KpiCard label="Facilities" value={String(facilityCount ?? 0)} />
          <KpiCard label="Products" value={String(productCount ?? 0)} />
          <KpiCard label="Scans · 30d" value={String(scans30d ?? 0)} />
        </div>
      </section>

      <section aria-labelledby="members">
        <SectionTitle numeral="01" eyebrow="Access" title="Members" />
        {memberRows.length === 0 ? (
          <p className="mono-sm text-text-dim">No members.</p>
        ) : (
          <div className="hairline bg-[var(--surface)] overflow-hidden">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  <th className="label-text text-left px-14 py-12 font-normal">
                    Member
                  </th>
                  <th className="label-text text-left px-14 py-12 font-normal">
                    Role
                  </th>
                  <th className="label-text text-left px-14 py-12 font-normal">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody>
                {memberRows.map((m) => {
                  const profile = Array.isArray(m.profile)
                    ? m.profile[0]
                    : m.profile;
                  return (
                    <tr key={m.user_id} className="hairline-b last:border-b-0">
                      <td className="px-14 py-12">
                        <span
                          className="text-text"
                          style={{
                            fontFamily: "var(--display)",
                            fontSize: 13,
                          }}
                        >
                          {profile?.full_name || profile?.email || "—"}
                        </span>
                        {profile?.full_name && profile?.email && (
                          <span className="mono-sm text-text-dim ml-8">
                            {profile.email}
                          </span>
                        )}
                      </td>
                      <td className="px-14 py-12">
                        <Badge
                          tone={ROLE_TONE[m.role] ?? "neutral"}
                          variant="filled"
                        >
                          {m.role}
                        </Badge>
                      </td>
                      <td className="px-14 py-12">
                        <span className="mono-sm text-text-secondary">
                          {fmtDate(m.joined_at)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="billing">
        <SectionTitle numeral="02" eyebrow="Billing" title="Subscription" />
        <div className="hairline bg-[var(--surface)] px-16 py-14 flex flex-col gap-8">
          <Row label="Tier" value={org.tier} />
          <Row
            label="Orders (all time)"
            value={String(orderCount ?? 0)}
            mono
          />
          <Row
            label="Stripe customer"
            value={org.stripe_customer_id ?? "Not connected"}
            mono
          />
          <Row
            label="Stripe subscription"
            value={org.stripe_subscription_id ?? "Not connected"}
            mono
          />
          <p className="mono-sm text-text-dim mt-4">
            Billing is not yet wired to Stripe — these fields reflect stored ids
            only.
          </p>
        </div>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-12">
      <span className="label-text text-text-muted">{label}</span>
      <span
        className={`${mono ? "mono-sm" : ""} text-text break-all text-right`}
        style={mono ? undefined : { fontFamily: "var(--display)", fontSize: 13 }}
      >
        {value}
      </span>
    </div>
  );
}
