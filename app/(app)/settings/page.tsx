import { createClient } from "@/lib/supabase/server";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Badge } from "@/components/ui/Badge";

export const metadata = { title: "Account · Settings" };

type OrgRole = "owner" | "admin" | "member";

const ROLE_TONE: Record<OrgRole, "accent" | "info" | "neutral"> = {
  owner: "accent",
  admin: "info",
  member: "neutral",
};

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("full_name, phone, created_at")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const { data: orgs } = user
    ? await supabase
        .from("org_members")
        .select("role, joined_at, org:orgs ( id, name, slug, created_at )")
        .eq("user_id", user.id)
    : { data: null };

  return (
    <div className="flex flex-col gap-40">
      <section aria-labelledby="account-heading">
        <SectionTitle eyebrow="Identity" title="Account details" />
        <dl className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
          <Row label="Email" value={user?.email ?? "—"} mono />
          <Row label="Full name" value={profile?.full_name ?? "Not set"} />
          <Row label="Phone" value={profile?.phone ?? "Not set"} mono />
          <Row
            label="Member since"
            value={
              profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString()
                : "—"
            }
            mono
          />
          <Row label="User ID" value={user?.id ?? "—"} mono />
        </dl>
      </section>

      <section aria-labelledby="workspaces-heading">
        <SectionTitle eyebrow="Access" title="Workspaces" />
        {!orgs || orgs.length === 0 ? (
          <p className="hairline bg-[var(--surface)] px-20 py-16 mono-sm text-text-muted">
            You&apos;re not a member of any workspaces yet.
          </p>
        ) : (
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {orgs.map(
              (
                m: { role: string; joined_at: string | null; org: unknown },
                i: number
              ) => {
                const org = Array.isArray(m.org) ? m.org[0] : m.org;
                const role = m.role as OrgRole;
                return (
                  <li
                    key={i}
                    className="px-20 py-16 flex items-center gap-16 row-interactive"
                  >
                    <span className="w-32 h-32 hairline-subtle bg-[var(--accent-dim)] flex items-center justify-center shrink-0">
                      <span className="label-text--lg text-[var(--accent)]">
                        {(org?.name ?? "?").slice(0, 1).toUpperCase()}
                      </span>
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-text"
                        style={{
                          fontFamily: "var(--display)",
                          fontSize: 14,
                          fontWeight: 500,
                        }}
                      >
                        {org?.name ?? "Unknown workspace"}
                      </p>
                      <p className="mono-sm text-text-muted">
                        {org?.slug ?? "—"}
                      </p>
                    </div>
                    <Badge tone={ROLE_TONE[role]} variant="filled">
                      {role}
                    </Badge>
                    <span className="mono-sm text-text-dim hidden md:inline">
                      Joined{" "}
                      {m.joined_at
                        ? new Date(m.joined_at).toLocaleDateString()
                        : "—"}
                    </span>
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
    <div className="px-20 py-14 grid grid-cols-[200px_1fr] gap-16 items-center">
      <dt className="label-text">{label}</dt>
      <dd
        className={`${
          mono ? "mono-body" : "body-text--display"
        } text-text break-all`}
      >
        {value}
      </dd>
    </div>
  );
}
