import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { CornerButton } from "@/components/ui/CornerButton";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users, Trash2 } from "lucide-react";
import { InviteMemberForm } from "./InviteMemberForm";
import { BulkInviteButton } from "./BulkInviteButton";
import { removeMember, updateMemberRole } from "./actions";

export const metadata = { title: "Team" };

const ROLE_TONE: Record<string, "accent" | "warning" | "neutral"> = {
  owner: "accent",
  admin: "warning",
  member: "neutral",
};

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d < 1) return "Today";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function TeamPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Resolve the current user's org + role
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role, organization:organizations ( name )")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return (
      <div className="flex flex-col gap-32">
        <PageHeader
          eyebrow="Workspace · Settings"
          title="Team"
          description="No workspace membership found."
        />
      </div>
    );
  }

  const canManage = membership.role === "owner" || membership.role === "admin";

  // Load all members of this org
  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, role, created_at, user:profiles ( email, full_name )")
    .eq("org_id", membership.org_id)
    .order("created_at", { ascending: true });

  type MemberRow = {
    user_id: string;
    role: string;
    created_at: string;
    user:
      | { email: string; full_name: string | null }
      | { email: string; full_name: string | null }[]
      | null;
  };
  const rows = (members ?? []) as MemberRow[];
  const ownerCount = rows.filter((m) => m.role === "owner").length;

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Workspace · Settings"
        title="Team"
        description={
          canManage
            ? "Invite operators, promote admins, and remove access. Changes take effect on the member's next page load."
            : "People with access to this workspace."
        }
        meta={[
          { label: "Members", value: rows.length },
          {
            label: "Owners",
            value: ownerCount,
            status: ownerCount > 1 ? "live" : undefined,
          },
        ]}
      />

      {canManage && (
        <section aria-labelledby="invite">
          <div className="flex items-center justify-between mb-12">
            <h2
              id="invite"
              className="label-text"
              style={{ color: "var(--text-muted)" }}
            >
              — Invite a teammate
            </h2>
            <BulkInviteButton orgId={membership.org_id} />
          </div>
          <InviteMemberForm orgId={membership.org_id} />
        </section>
      )}

      <section aria-labelledby="members">
        <h2
          id="members"
          className="label-text mb-12"
          style={{ color: "var(--text-muted)" }}
        >
          — Current members
        </h2>

        {rows.length === 0 ? (
          <EmptyState
            title="No members"
            description="That's unusual — at least one owner should exist."
            icon={<Users size={20} strokeWidth={1.5} />}
          />
        ) : (
          <div className="hairline bg-[var(--surface)] overflow-hidden">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  <th className="label-text text-left px-14 py-10 font-normal">
                    Name
                  </th>
                  <th className="label-text text-left px-14 py-10 font-normal">
                    Email
                  </th>
                  <th className="label-text text-left px-14 py-10 font-normal">
                    Role
                  </th>
                  <th className="label-text text-left px-14 py-10 font-normal">
                    Joined
                  </th>
                  {canManage && (
                    <th
                      className="label-text text-right px-14 py-10 font-normal"
                      style={{ width: 100 }}
                    >
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const u = Array.isArray(m.user) ? m.user[0] : m.user;
                  const isSelf = m.user_id === user.id;
                  const isLastOwner = m.role === "owner" && ownerCount === 1;

                  return (
                    <tr key={m.user_id} className="hairline-b">
                      <td className="px-14 py-12">
                        <span
                          className="text-text"
                          style={{
                            fontFamily: "var(--display)",
                            fontSize: 13,
                          }}
                        >
                          {u?.full_name || "—"}
                        </span>
                        {isSelf && (
                          <span className="label-text text-text-dim ml-8">
                            (you)
                          </span>
                        )}
                      </td>
                      <td className="px-14 py-12 mono-sm text-text-secondary">
                        {u?.email ?? "—"}
                      </td>
                      <td className="px-14 py-12">
                        {canManage && !isLastOwner ? (
                          <form
                            action={updateMemberRole}
                            className="flex items-center gap-8"
                          >
                            <input
                              type="hidden"
                              name="org_id"
                              value={membership.org_id}
                            />
                            <input
                              type="hidden"
                              name="user_id"
                              value={m.user_id}
                            />
                            <Select
                              name="role"
                              defaultValue={m.role}
                              options={[
                                { value: "owner", label: "Owner" },
                                { value: "admin", label: "Admin" },
                                { value: "member", label: "Member" },
                              ]}
                              compact
                            />
                            <CornerButton
                              type="submit"
                              variant="ghost"
                              size="sm"
                            >
                              Save
                            </CornerButton>
                          </form>
                        ) : (
                          <Badge
                            tone={ROLE_TONE[m.role] ?? "neutral"}
                            variant="filled"
                          >
                            {m.role}
                          </Badge>
                        )}
                      </td>
                      <td className="px-14 py-12 mono-sm text-text-muted">
                        {relTime(m.created_at)}
                      </td>
                      {canManage && (
                        <td className="px-14 py-12 text-right">
                          {!isSelf && !isLastOwner && (
                            <form
                              action={removeMember}
                              style={{ display: "inline" }}
                            >
                              <input
                                type="hidden"
                                name="org_id"
                                value={membership.org_id}
                              />
                              <input
                                type="hidden"
                                name="user_id"
                                value={m.user_id}
                              />
                              <button
                                type="submit"
                                className="hairline-subtle p-6 text-text-muted hover:text-[var(--danger)] hover:border-[var(--danger)] transition-colors"
                                aria-label={`Remove ${u?.email ?? "member"}`}
                                title="Remove member"
                              >
                                <Trash2 size={11} strokeWidth={1.5} />
                              </button>
                            </form>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
