import { randomBytes } from "crypto";
import { EMAIL_RE, MAX_INVITES } from "@/lib/modules";

export { MAX_INVITES };

/**
 * Shared workspace-provisioning helpers.
 *
 * These previously existed as four private inline copies (onboarding,
 * workspaces/new, the dead app/(app) duplicate, and /admin/onboard — whose
 * copy had drifted and could produce an empty slug). One exported copy,
 * unit-tested in test/workspaceHelpers.test.ts.
 */

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) ||
    // Fallback for names that strip to empty (symbols-only, non-Latin, …)
    `ws-${randomBytes(3).toString("hex")}`
  );
}

/**
 * Parse a free-text emails field into a clean invite list: split on
 * comma/semicolon/whitespace, lowercase, drop non-emails, exclude the
 * inviter's own address (case-insensitively), dedupe, cap at MAX_INVITES.
 */
export function parseEmails(raw: string, selfEmail?: string | null): string[] {
  return parseEmailsDetailed(raw, selfEmail).emails;
}

/**
 * As `parseEmails`, but also reports how many valid addresses were dropped by
 * the MAX_INVITES cap — so a caller can say so instead of silently inviting
 * fewer people than the user typed.
 */
export function parseEmailsDetailed(
  raw: string,
  selfEmail?: string | null
): { emails: string[]; overflow: number } {
  const self = selfEmail?.trim().toLowerCase() ?? null;
  const cleaned = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && EMAIL_RE.test(s))
    .filter((s) => s !== self);
  const unique = Array.from(new Set(cleaned));
  return {
    emails: unique.slice(0, MAX_INVITES),
    overflow: Math.max(0, unique.length - MAX_INVITES),
  };
}
