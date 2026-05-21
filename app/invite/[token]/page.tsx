import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { CornerLink } from "@/components/ui/CornerButton";
import { AlertTriangle, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteAcceptClient } from "./InviteAcceptClient";

export const metadata = { title: "Accept invite · Nautilus" };

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;

  // Look up the invite first using the admin client — token is the auth
  // factor, RLS would otherwise block since the user isn't a member yet.
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("org_invites")
    .select(
      "id, org_id, email, role, expires_at, accepted_at, org:orgs ( id, name )"
    )
    .eq("token", token)
    .maybeSingle();

  const expired =
    invite?.expires_at && new Date(invite.expires_at) < new Date();
  const accepted = Boolean(invite?.accepted_at);

  // Gate auth — but keep token in URL so we land back here after login.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  // Resolve org reference (Supabase returns either object or array depending
  // on relationship inference).
  const org = invite?.org
    ? Array.isArray(invite.org)
      ? invite.org[0]
      : invite.org
    : null;

  return (
    <main className="min-h-screen flex flex-col relative">
      <div
        className="absolute inset-0 dot-grid opacity-40 pointer-events-none"
        aria-hidden
      />
      <header className="relative z-10 px-32 md:px-48 py-24 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-10 text-text"
          aria-label="Nautilus"
        >
          <Logo size={20} />
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 12,
              letterSpacing: "2.5px",
              fontWeight: 500,
            }}
          >
            Nautilus
          </span>
        </Link>
        <span className="label-text text-text-muted">Team invite</span>
      </header>

      <section className="relative z-10 flex-1 flex items-center justify-center px-20 py-40">
        <div className="w-full max-w-[480px] hairline bg-[var(--surface)] p-32 flex flex-col gap-20 brackets">
          {!invite || !org ? (
            <InviteError
              title="Invite not found"
              body="This link is invalid or has been revoked. Ask whoever invited you to send a new one."
            />
          ) : expired ? (
            <InviteError
              title="Invite expired"
              body={`This invite to ${org.name} expired. Ask an admin to send a new one.`}
            />
          ) : accepted ? (
            <InviteError
              title="Already accepted"
              body={`You've already joined ${org.name}.`}
              cta={{ href: "/", label: "Go to overview →" }}
            />
          ) : invite.email.toLowerCase() !==
            (user!.email ?? "").toLowerCase() ? (
            <InviteError
              title="Email mismatch"
              body={`This invite is for ${invite.email}. You're signed in as ${
                user!.email
              }. Sign out and sign in with the invited address to accept.`}
            />
          ) : (
            <InviteAcceptClient
              token={token}
              orgName={org.name}
              role={invite.role}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function InviteError({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <>
      <header className="flex items-start gap-14">
        <span
          className="w-40 h-40 hairline-subtle bg-[var(--danger-dim)] flex items-center justify-center text-[var(--danger)] shrink-0"
          aria-hidden
        >
          <AlertTriangle size={16} strokeWidth={1.5} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="label-text mb-4" style={{ color: "var(--danger)" }}>
            Couldn&apos;t accept
          </p>
          <h1
            style={{
              fontFamily: "var(--display)",
              fontSize: 22,
              fontWeight: 500,
              color: "var(--text)",
              margin: "0 0 8px",
            }}
          >
            {title}
          </h1>
          <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
            {body}
          </p>
        </div>
      </header>
      <footer className="hairline-t pt-16">
        <CornerLink href={cta?.href ?? "/"} variant="ghost" size="sm">
          {cta?.label ?? "Back to overview"}
        </CornerLink>
      </footer>
    </>
  );
}
