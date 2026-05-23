import "server-only";

/**
 * Platform transactional email sender.
 *
 * Sends from the operator's own Resend account using app-level env vars —
 * NOT a per-org integration. Use this for system mail that must work for
 * every workspace regardless of what the customer has configured: team
 * invites, and any future auth/transactional notices.
 *
 * Required env (set in the app's hosting environment, e.g. Vercel):
 *   RESEND_API_KEY      Resend API key (from the Resend dashboard)
 *   SYSTEM_EMAIL_FROM   verified sender, e.g. "Nautilus <noreply@yourdomain.com>"
 * Optional:
 *   SYSTEM_EMAIL_REPLY_TO   reply-to address
 *
 * Returns { ok } so callers can fall back (e.g. surface a copy-link) when
 * email isn't configured or Resend rejects the send. Never throws.
 */

interface SendInput {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

export function isSystemEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.SYSTEM_EMAIL_FROM);
}

export async function sendSystemEmail(
  input: SendInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SYSTEM_EMAIL_FROM;
  if (!apiKey || !from) {
    return {
      ok: false,
      error:
        "System email not configured (set RESEND_API_KEY and SYSTEM_EMAIL_FROM).",
    };
  }

  const body: Record<string, unknown> = {
    from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  };
  const replyTo = process.env.SYSTEM_EMAIL_REPLY_TO;
  if (replyTo) body.reply_to = replyTo;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };
    if (res.ok && data.id) return { ok: true, id: data.id };
    return {
      ok: false,
      error: data.message || data.name || `Resend returned ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}
