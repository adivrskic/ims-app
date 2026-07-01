import { createClient } from "@/lib/supabase/server";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Badge } from "@/components/ui/Badge";
import { CornerButton } from "@/components/ui/CornerButton";
import { InviteForm } from "./InviteForm";
import { BulkInviteButton } from "./BulkInviteButton";
import { MemberPermissions } from "./MemberPermissions";
import { removeMember, revokeInvite } from "../actions";
import { effectivePermissions } from "@/lib/permissions";
import { Mail, X } from "lucide-react";

export const metadata = { title: "Members · Settings" };

type OrgRole = "owner" | "admin" | "member";

const ROLE_TONE: Record<OrgRole, "accent" | "info" | "neutral"> = {
  owner: "accent",
  admin: "info",
  member: "neutral",
};

export default async function MembersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: membersData },
    { data: invitesData },
    { data: currentMembership },
  ] = await Promise.all([
    supabase
      .from("org_members")
      .select(
        "user_id, role, joined_at, permissions, profile:profiles ( email, full_name )"
      )
      .order("joined_at", { ascending: true }),
    supabase
      .from("org_invites")
      .select("id, email, role, created_at, expires_at, accepted_at")
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("org_members")
      .select("role, permissions, org_id")
      .eq("user_id", user?.id ?? "")
      .limit(1)
      .maybeSingle(),
  ]);

  const currentRole = (currentMembership?.role ?? "member") as OrgRole;
  const orgId = (currentMembership?.org_id as string | undefined) ?? undefined;
  const isAdmin = effectivePermissions(
    currentRole,
    (currentMembership?.permissions as string[] | null) ?? null
  ).has("members.manage");

  return (
    <div className="flex flex-col gap-40">
      {isAdmin && (
        <section aria-labelledby="invite-heading" className="flex flex-col gap-14">
          <div className="flex items-center justify-between">
            <h2
              id="invite-heading"
              className="label-text"
              style={{ color: "var(--text-muted)" }}
            >
              — Invite a teammate
            </h2>
            {orgId && <BulkInviteButton orgId={orgId} />}
          </div>
          <InviteForm />
        </section>
      )}

      <section aria-labelledby="members-heading">
        <SectionTitle
          eyebrow="Workspace"
          title="Members"
          action={
            <span className="label-text text-text-muted">
              {membersData?.length ?? 0} total
            </span>
          }
        />
        <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
          {(membersData ?? []).map(
            (m: {
              user_id: string;
              role: string;
              joined_at: string | null;
              permissions: string[] | null;
              profile: unknown;
            }) => {
              const profile = Array.isArray(m.profile)
                ? m.profile[0]
                : m.profile;
              const p = profile as {
                email: string;
                full_name: string | null;
              } | null;
              const role = m.role as OrgRole;
              const isSelf = m.user_id === user?.id;
              const memberPerms = [
                ...effectivePermissions(role, m.permissions),
              ];
              const initials = (p?.full_name || p?.email || "?")
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")
                .toUpperCase();
              return (
                <li
                  key={m.user_id}
                  className="px-20 py-14 flex flex-col gap-10 row-interactive"
                >
                  <div className="flex items-center gap-14">
                  <span
                    className="w-28 h-28 rounded-full bg-[var(--accent)] text-[var(--black)] flex items-center justify-center shrink-0"
                    aria-hidden
                  >
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      {initials}
                    </span>
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-8">
                      <p
                        className="text-text truncate"
                        style={{
                          fontFamily: "var(--display)",
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        {p?.full_name || p?.email?.split("@")[0] || "Unknown"}
                      </p>
                      {isSelf && (
                        <span className="label-text text-text-dim">· You</span>
                      )}
                    </div>
                    <p className="mono-sm text-text-muted truncate">
                      {p?.email ?? "—"}
                    </p>
                  </div>
                  <Badge tone={ROLE_TONE[role]} variant="filled">
                    {role}
                  </Badge>
                  <span className="mono-sm text-text-dim hidden md:inline w-[100px] text-right">
                    {m.joined_at
                      ? new Date(m.joined_at).toLocaleDateString()
                      : "—"}
                  </span>
                  {isAdmin && !isSelf && role !== "owner" && (
                    <form action={removeMember}>
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <CornerButton
                        type="submit"
                        variant="danger"
                        size="sm"
                        ariaLabel={`Remove ${p?.email ?? "member"}`}
                      >
                        Remove
                      </CornerButton>
                    </form>
                  )}
                  </div>
                  {isAdmin && !isSelf && role !== "owner" && (
                    <MemberPermissions
                      userId={m.user_id}
                      current={memberPerms}
                      isCustom={m.permissions != null}
                    />
                  )}
                </li>
              );
            }
          )}
        </ul>
      </section>

      <section aria-labelledby="invites-heading">
        <SectionTitle
          eyebrow="Pending"
          title="Invites"
          action={
            <span className="label-text text-text-muted">
              {invitesData?.length ?? 0} outstanding
            </span>
          }
        />
        {!invitesData || invitesData.length === 0 ? (
          <div className="hairline bg-[var(--surface-2)] px-20 py-24 flex flex-col items-center text-center gap-6">
            <Mail size={18} strokeWidth={1.5} className="text-text-muted" />
            <p className="mono-sm text-text-muted">No pending invites</p>
          </div>
        ) : (
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {invitesData.map(
              (inv: {
                id: string;
                email: string;
                role: string;
                created_at: string | null;
                expires_at: string | null;
              }) => {
                const role = inv.role as OrgRole;
                const expiresAt = inv.expires_at
                  ? new Date(inv.expires_at)
                  : null;
                const isExpired = expiresAt && expiresAt.getTime() < Date.now();
                return (
                  <li
                    key={inv.id}
                    className="px-20 py-14 flex items-center gap-14 row-interactive"
                  >
                    <span
                      className="w-28 h-28 hairline-subtle bg-[var(--surface-2)] flex items-center justify-center shrink-0 text-text-muted"
                      aria-hidden
                    >
                      <Mail size={12} strokeWidth={1.5} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-text truncate"
                        style={{
                          fontFamily: "var(--display)",
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        {inv.email}
                      </p>
                      <p className="mono-sm text-text-muted">
                        Invited{" "}
                        {inv.created_at
                          ? new Date(inv.created_at).toLocaleDateString()
                          : "—"}
                        {expiresAt && (
                          <>
                            {" · "}
                            <span
                              className={
                                isExpired ? "text-[var(--danger)]" : ""
                              }
                            >
                              {isExpired
                                ? "Expired"
                                : `Expires ${expiresAt.toLocaleDateString()}`}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <Badge tone={ROLE_TONE[role]} variant="outline">
                      {role}
                    </Badge>
                    {isAdmin && (
                      <form action={revokeInvite}>
                        <input type="hidden" name="id" value={inv.id} />
                        <button
                          type="submit"
                          className="hairline-subtle p-6 hover:border-[var(--danger)] hover:text-[var(--danger)] text-text-muted transition-colors"
                          aria-label={`Revoke invite to ${inv.email}`}
                        >
                          <X size={12} strokeWidth={1.5} />
                        </button>
                      </form>
                    )}
                  </li>
                );
              }
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
