import "server-only";
import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/data/user";

/**
 * Device/session tracking for Settings → Security.
 *
 * The middleware mints a stable `nb_device` cookie. On each authenticated page
 * load the layout calls recordDeviceSession(), which upserts a row keyed by
 * (user, device) with the latest last_seen / UA / IP and returns whether THIS
 * device has been revoked — letting the layout force a sign-out when another
 * device revoked it (eventual remote sign-out).
 *
 * Everything goes through the service-role client (filtered by user_id), so the
 * table needs no RLS policies. All calls fail-open: a missing migration or DB
 * hiccup must never break rendering or lock a user out.
 */

export interface DeviceSession {
  id: string;
  deviceId: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  current: boolean;
}

function clientIp(h: Headers): string | null {
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip");
}

/**
 * Upsert the current device's session and report whether it's been revoked.
 * Returns { revoked: true } only when we're certain — any error fails open.
 */
export async function recordDeviceSession(): Promise<{ revoked: boolean }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { revoked: false };

    const cookieStore = await cookies();
    const deviceId = cookieStore.get("nb_device")?.value;
    if (!deviceId) return { revoked: false };

    const h = await headers();
    const admin = createAdminClient();

    const { data } = await admin
      .from("user_sessions")
      .upsert(
        {
          user_id: user.id,
          device_id: deviceId,
          user_agent: h.get("user-agent"),
          ip: clientIp(h),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,device_id" }
      )
      .select("revoked_at")
      .single();

    const revokedAt = (data as { revoked_at: string | null } | null)?.revoked_at;
    return { revoked: Boolean(revokedAt) };
  } catch {
    return { revoked: false };
  }
}

/** List a user's active (non-revoked) device sessions, newest activity first. */
export async function listDeviceSessions(
  userId: string
): Promise<DeviceSession[]> {
  try {
    const cookieStore = await cookies();
    const currentDeviceId = cookieStore.get("nb_device")?.value ?? null;
    const admin = createAdminClient();

    const { data } = await admin
      .from("user_sessions")
      .select("id, device_id, user_agent, ip, created_at, last_seen_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false });

    return (
      (data ?? []) as Array<{
        id: string;
        device_id: string;
        user_agent: string | null;
        ip: string | null;
        created_at: string | null;
        last_seen_at: string | null;
      }>
    ).map((r) => ({
      id: r.id,
      deviceId: r.device_id,
      userAgent: r.user_agent,
      ip: r.ip,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      current: r.device_id === currentDeviceId,
    }));
  } catch {
    return [];
  }
}
