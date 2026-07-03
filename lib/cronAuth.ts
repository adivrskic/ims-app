import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time check that a scheduled-route request carries
 * `Authorization: Bearer <CRON_SECRET>`.
 *
 * Comparing sha256 digests (fixed length) instead of the raw strings keeps
 * timingSafeEqual happy regardless of attacker-controlled input length and
 * avoids leaking the secret's length.
 */
export function isAuthorizedCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const presented = auth.slice("Bearer ".length);

  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
