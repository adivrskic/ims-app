/**
 * Lot expiry helpers — pure, no DB. Used by the Lots page, product detail,
 * and (later) the expiry-alert cron + FEFO picking.
 */

/** Days until a lot expires (negative = already expired); null if no expiry. */
export function daysToExpiry(
  expiresAt: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!expiresAt) return null;
  const exp = new Date(expiresAt + "T00:00:00");
  if (Number.isNaN(exp.getTime())) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000);
}

export type ExpiryStatus = "expired" | "soon" | "ok" | "none";

/** Default "expiring soon" window, in days. */
export const EXPIRY_SOON_DAYS = 30;

export function expiryStatus(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
  soonDays: number = EXPIRY_SOON_DAYS
): ExpiryStatus {
  const d = daysToExpiry(expiresAt, now);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= soonDays) return "soon";
  return "ok";
}

/** Short human label for an expiry date, e.g. "Expired 3d ago", "in 12d". */
export function expiryLabel(
  expiresAt: string | null | undefined,
  now: Date = new Date()
): string {
  const d = daysToExpiry(expiresAt, now);
  if (d === null) return "No expiry";
  if (d < 0) return `Expired ${Math.abs(d)}d ago`;
  if (d === 0) return "Expires today";
  if (d === 1) return "Expires tomorrow";
  return `Expires in ${d}d`;
}
