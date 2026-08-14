import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerLink } from "@/components/ui/CornerButton";
import { Building2, Plus, ChevronRight } from "lucide-react";

export const metadata = { title: "Workspaces · Staff" };

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  tier: string;
  created_at: string;
  onboarded_at: string | null;
  members: Array<{ count: number }> | { count: number } | null;
}

const TIER_TONE: Record<string, "neutral" | "info" | "accent"> = {
  starter: "neutral",
  pro: "info",
  enterprise: "accent",
};

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d < 1) return "Today";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function AdminDashboard() {
  // Service-role client — reads across every organization
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("orgs")
    .select(
      "id, name, slug, tier, created_at, onboarded_at, members:org_members ( count )"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="flex flex-col gap-32">
        <PageHeader
          eyebrow="Staff"
          title="Workspaces"
          description="All organizations across Nautilus."
        />
        <p className="mono-sm text-[var(--danger)]">
          Failed to load workspaces: {error.message}
        </p>
      </div>
    );
  }

  const orgs = (data ?? []) as OrgRow[];

  const tierCounts = orgs.reduce(
    (acc, o) => ({ ...acc, [o.tier]: (acc[o.tier] ?? 0) + 1 }),
    {} as Record<string, number>
  );

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Staff"
        title="Workspaces"
        description="Every organization that's signed up or been onboarded. Drill in to see members, activity, and billing."
        meta={[
          { label: "Total", value: orgs.length },
          { label: "Starter", value: tierCounts.starter ?? 0 },
          { label: "Pro", value: tierCounts.pro ?? 0 },
          {
            label: "Enterprise",
            value: tierCounts.enterprise ?? 0,
            status: (tierCounts.enterprise ?? 0) > 0 ? "live" : undefined,
          },
        ]}
        actions={
          <CornerLink href="/admin/onboard" variant="primary" size="sm">
            <Plus size={11} strokeWidth={1.5} />
            Onboard client
          </CornerLink>
        }
      />

      {orgs.length === 0 ? (
        <EmptyState
          title="No workspaces yet"
          description="Onboard your first client to populate this list."
          icon={<Building2 size={20} strokeWidth={1.5} />}
        />
      ) : (
        <div className="hairline bg-[var(--surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  <th className="label-text text-left px-14 py-12 font-normal">
                    Workspace
                  </th>
                  <th className="label-text text-left px-14 py-12 font-normal">
                    Tier
                  </th>
                  <th className="label-text text-right px-14 py-12 font-normal">
                    Members
                  </th>
                  <th className="label-text text-left px-14 py-12 font-normal">
                    Created
                  </th>
                  <th className="label-text text-left px-14 py-12 font-normal">
                    Onboarded
                  </th>
                  <th aria-hidden style={{ width: 28 }} />
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => {
                  const members = Array.isArray(o.members)
                    ? o.members[0]
                    : o.members;
                  return (
                    <tr key={o.id} className="hairline-b row-interactive group">
                      <td className="px-14 py-14">
                        <Link
                          href={`/admin/workspace/${o.id}`}
                          className="flex flex-col gap-2 group-hover:text-[var(--accent)] transition-colors"
                        >
                          <span
                            className="text-text"
                            style={{
                              fontFamily: "var(--display)",
                              fontSize: 13,
                              fontWeight: 500,
                            }}
                          >
                            {o.name}
                          </span>
                          <span
                            className="mono-sm text-text-muted"
                            style={{ fontSize: 11 }}
                          >
                            {o.slug}
                          </span>
                        </Link>
                      </td>
                      <td className="px-14 py-14">
                        <Badge
                          tone={TIER_TONE[o.tier] ?? "neutral"}
                          variant="filled"
                        >
                          {o.tier}
                        </Badge>
                      </td>
                      <td className="px-14 py-14 text-right">
                        <span
                          className="tnum text-text-secondary"
                          style={{ fontFamily: "var(--mono)", fontSize: 12 }}
                        >
                          {members?.count ?? 0}
                        </span>
                      </td>
                      <td className="px-14 py-14">
                        <span className="mono-sm text-text-secondary">
                          {relTime(o.created_at)}
                        </span>
                      </td>
                      <td className="px-14 py-14">
                        {o.onboarded_at ? (
                          <span className="mono-sm text-text-secondary">
                            {relTime(o.onboarded_at)}
                          </span>
                        ) : (
                          <span className="mono-sm text-text-dim">
                            Self-signup
                          </span>
                        )}
                      </td>
                      <td className="px-14 py-14">
                        <ChevronRight
                          size={12}
                          strokeWidth={1.5}
                          className="text-text-dim"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
