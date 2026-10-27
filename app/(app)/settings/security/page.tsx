import { SectionTitle } from "@/components/ui/SectionTitle";
import { Badge } from "@/components/ui/Badge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { LocalTime } from "@/components/ui/LocalTime";
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

export default async function SecurityPage() {
  const user = await getCurrentUser();
  const sessions: DeviceSession[] = user
    ? await listDeviceSessions(user.id)
    : [];

  return (
    <div className="flex flex-col gap-40">
      <section aria-labelledby="password-heading">
        <SectionTitle id="password-heading" eyebrow="Credentials" title="Password" />
        <PasswordChangeForm />
      </section>

      <section aria-labelledby="2fa-heading">
        <SectionTitle
          id="2fa-heading"
          eyebrow="Sign-in"
          title="Two-factor authentication"
        />
        <SecurityClient />
      </section>

      <section aria-labelledby="sessions-heading">
        <SectionTitle
          id="sessions-heading"
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
                    <span>
                      Active <LocalTime iso={s.lastSeenAt} format="relative" />
                    </span>
                  </div>
                </div>
                {!s.current && (
                  <form action={revokeDeviceSession}>
                    <input type="hidden" name="id" value={s.id} />
                    <SubmitButton
                      variant="danger"
                      size="sm"
                      ariaLabel={`Revoke ${deviceLabel(s.userAgent)}`}
                      confirm={`Sign out ${deviceLabel(s.userAgent)}${
                        s.ip ? ` (${s.ip})` : ""
                      }? That device will have to sign in again.`}
                    >
                      Revoke
                    </SubmitButton>
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
