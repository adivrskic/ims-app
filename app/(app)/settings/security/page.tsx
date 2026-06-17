import { SectionTitle } from "@/components/ui/SectionTitle";
import { Badge } from "@/components/ui/Badge";
import { CornerButton } from "@/components/ui/CornerButton";
import { SecurityClient } from "./SecurityClient";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { getCurrentUser } from "@/lib/data/user";
import { listDeviceSessions, type DeviceSession } from "@/lib/deviceSession";
import { revokeDeviceSession } from "./actions";
import { Monitor } from "lucide-react";

export const metadata = { title: "Security · Settings" };

/** Best-effort friendly label from a user-agent string. */
function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg/.test(ua)
    ? "Edge"
    : /Chrome/.test(ua)
    ? "Chrome"
    : /Firefox/.test(ua)
    ? "Firefox"
    : /Safari/.test(ua)
    ? "Safari"
    : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
    ? "macOS"
    : /iPhone|iPad|iOS/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
    ? "Android"
    : /Linux/.test(ua)
    ? "Linux"
    : "";
  return os ? `${browser} · ${os}` : browser;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function SecurityPage() {
  const user = await getCurrentUser();
  const sessions: DeviceSession[] = user
    ? await listDeviceSessions(user.id)
    : [];

  return (
    <div className="flex flex-col gap-40">
      <section aria-labelledby="password-heading">
        <SectionTitle eyebrow="Credentials" title="Password" />
        <PasswordChangeForm />
      </section>

      <section aria-labelledby="2fa-heading">
        <SectionTitle eyebrow="Sign-in" title="Two-factor authentication" />
        <SecurityClient />
      </section>

      <section aria-labelledby="sessions-heading">
        <SectionTitle
          eyebrow="Sessions"
          title="Active devices"
          action={
            sessions.length > 0 ? (
              <span className="label-text text-text-muted">
                {sessions.length}{" "}
                {sessions.length === 1 ? "device" : "devices"}
              </span>
            ) : undefined
          }
        />
        {sessions.length === 0 ? (
          <div className="hairline bg-[var(--surface-2)] px-20 py-24">
            <p className="mono-sm text-text-muted">
              No tracked devices yet — this list populates as you sign in and
              navigate. Revoking a device signs it out on its next page load.
            </p>
          </div>
        ) : (
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="px-20 py-14 flex items-center gap-14 row-interactive"
              >
                <span
                  className="w-28 h-28 hairline-subtle bg-[var(--surface-2)] flex items-center justify-center shrink-0 text-text-muted"
                  aria-hidden
                >
                  <Monitor size={12} strokeWidth={1.5} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-10 flex-wrap">
                    <p
                      className="text-text"
                      style={{
                        fontFamily: "var(--display)",
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      {deviceLabel(s.userAgent)}
                    </p>
                    {s.current && (
                      <Badge tone="success" variant="outline">
                        This device
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-12 mono-sm text-text-muted">
                    {s.ip && <span>{s.ip}</span>}
                    <span>·</span>
                    <span>Active {timeAgo(s.lastSeenAt)}</span>
                  </div>
                </div>
                {!s.current && (
                  <form action={revokeDeviceSession}>
                    <input type="hidden" name="id" value={s.id} />
                    <CornerButton
                      type="submit"
                      variant="danger"
                      size="sm"
                      ariaLabel="Revoke this device"
                    >
                      Revoke
                    </CornerButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
