import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { sendSystemEmail, isSystemEmailConfigured } from "@/lib/email/system";
import { digestEmail } from "@/lib/email/templates";

/**
 * Daily unread-notification email digest.
 *
 * For every user who opted in (profiles.digest_email_enabled), mails their
 * unread notifications via the PLATFORM Resend account (lib/email/system —
 * same path as team invites), so it works whether or not the org connected
 * its own Resend integration. A user is only mailed when something NEW
 * arrived since their last digest — a stagnant unread pile doesn't re-mail
 * daily.
 *
 * SCHEDULE: pg_cron daily 12:00 UTC (see the email_digests migration).
 * AUTH: CRON_SECRET bearer, constant-time compare. Admin client (RLS
 * bypassed); notifications are queried per user id.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ITEMS_IN_EMAIL = 12;
const SEND_CONCURRENCY = 5;

export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isSystemEmailConfigured()) {
    return NextResponse.json({ ok: true, skipped: "email_not_configured" });
  }

  const admin = createAdminClient();
  const summary = { candidates: 0, sent: 0, errors: 0 };

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, email, full_name, digest_last_sent_at")
    .eq("digest_email_enabled", true)
    .eq("is_active", true)
    .not("email", "is", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = (profiles ?? []) as Array<{
    id: string;
    email: string;
    full_name: string | null;
    digest_last_sent_at: string | null;
  }>;
  summary.candidates = users.length;

  for (let i = 0; i < users.length; i += SEND_CONCURRENCY) {
    const chunk = users.slice(i, i + SEND_CONCURRENCY);
    const results = await Promise.all(chunk.map((u) => digestFor(admin, u)));
    for (const r of results) {
      if (r === "sent") summary.sent++;
      if (r === "error") summary.errors++;
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}

async function digestFor(
  admin: ReturnType<typeof createAdminClient>,
  user: {
    id: string;
    email: string;
    full_name: string | null;
    digest_last_sent_at: string | null;
  }
): Promise<"sent" | "skipped" | "error"> {
  try {
    const { data: unread, count } = await admin
      .from("notifications")
      .select("title, body, link, kind, created_at", { count: "exact" })
      .eq("user_id", user.id)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_ITEMS_IN_EMAIL);

    const items = (unread ?? []) as Array<{
      title: string;
      body: string | null;
      link: string | null;
      kind: string;
      created_at: string | null;
    }>;
    const totalUnread = count ?? items.length;
    if (items.length === 0) return "skipped";

    // Only mail when something arrived after the last digest — an untouched
    // unread pile shouldn't generate the same email every morning.
    if (user.digest_last_sent_at) {
      const newest = items[0]?.created_at;
      if (!newest || newest <= user.digest_last_sent_at) return "skipped";
    }

    const mail = digestEmail({
      recipientName: user.full_name,
      items,
      totalUnread,
    });
    const res = await sendSystemEmail({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    if (!res.ok) {
      console.error(`[email-digests] send failed for ${user.id}:`, res.error);
      return "error";
    }

    await admin
      .from("profiles")
      .update({ digest_last_sent_at: new Date().toISOString() })
      .eq("id", user.id);
    return "sent";
  } catch (err) {
    console.error(`[email-digests] user ${user.id} failed:`, err);
    return "error";
  }
}
