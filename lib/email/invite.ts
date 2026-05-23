import "server-only";
import {
  findResendIntegration,
  sendInviteViaResend,
} from "@/lib/integrations/resend";
import { inviteEmail, type InviteEmailInput } from "@/lib/email/templates";
import { sendSystemEmail } from "@/lib/email/system";

/**
 * Single entry point for sending a team-invite email.
 *
 * Delivery order:
 *   1. The org's own connected Resend integration, if any (lets a customer
 *      send from their own verified domain).
 *   2. The platform Resend sender (sendSystemEmail) — the default that works
 *      for every workspace.
 *
 * Never throws. Returns which path delivered (or "none" if neither is
 * configured / both failed) so callers can decide whether to surface the
 * raw invite link as a manual fallback.
 *
 * The InviteEmailInput.token is turned into the /invite/{token} URL by the
 * inviteEmail template (which builds on NEXT_PUBLIC_APP_URL), so make sure
 * that env var points at the real app origin.
 */
export async function sendInviteEmail(
  orgId: string,
  input: InviteEmailInput
): Promise<{ ok: boolean; via: "org" | "platform" | "none"; error?: string }> {
  const orgResend = await findResendIntegration(orgId);
  if (orgResend) {
    const r = await sendInviteViaResend(orgResend, input);
    if (r.ok) return { ok: true, via: "org" };
    // Org integration errored — fall through to the platform sender.
  }

  const { subject, html, text } = inviteEmail(input);
  const r = await sendSystemEmail({
    to: input.recipientEmail,
    subject,
    html,
    text,
  });
  return r.ok
    ? { ok: true, via: "platform" }
    : { ok: false, via: "none", error: r.error };
}
