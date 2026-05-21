"use client";

import { useActionState, useState, useTransition } from "react";
import { AlertTriangle, Check, Mail, Plug, Unplug, Zap } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import {
  INTEGRATION_EVENTS,
  EVENT_META,
  type IntegrationEvent,
} from "@/lib/integrations/types";
import {
  connectResend,
  disconnectResend,
  reTestResend,
  type ConnectResendResult,
} from "./actions";

interface Props {
  existing: {
    status: "connected" | "error" | "disconnected";
    config: { from_address?: string; reply_to?: string };
    events_enabled: string[];
    last_synced_at: string | null;
    last_error: string | null;
  } | null;
}

export function ResendConfigForm({ existing }: Props) {
  const [state, formAction, pending] = useActionState;
  ConnectResendResult | undefined, FormData > (connectResend, undefined);

  const [enabled, setEnabled] = useState<string[]>(
    existing?.events_enabled ?? []
  );

  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);
  const [testPending, startTestTransition] = useTransition();
  const [disconnectPending, startDisconnect] = useTransition();

  const handleTest = () => {
    setTestResult(null);
    startTestTransition(async () => {
      setTestResult(await reTestResend());
    });
  };

  const handleDisconnect = () => {
    if (
      !confirm(
        "Disconnect Resend? Invite emails and event digests will stop sending until you reconnect."
      )
    ) {
      return;
    }
    startDisconnect(async () => {
      await disconnectResend();
    });
  };

  const toggleEvent = (e: IntegrationEvent) => {
    setEnabled((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-24">
      <form action={formAction} className="flex flex-col gap-24">
        {/* ── Credentials ───────────────────────────────────────── */}
        <section className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16">
          <header className="flex items-baseline justify-between gap-12">
            <p className="label-text--lg">01 · API key + sender</p>
            {existing?.status === "connected" && (
              <span className="label-text text-[var(--success)] inline-flex items-center gap-6">
                <Check size={10} strokeWidth={1.5} /> Connected
              </span>
            )}
            {existing?.status === "error" && (
              <span className="label-text text-[var(--danger)] inline-flex items-center gap-6">
                <AlertTriangle size={10} strokeWidth={1.5} /> Errored
              </span>
            )}
          </header>
          <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
            In Resend, go to <strong>API Keys → Create API Key</strong> with{" "}
            <em>Sending access</em>. Paste the key below. The from-address must
            use a domain you&apos;ve verified at{" "}
            <strong>Domains → Add Domain</strong> (look for green DNS check
            marks).
          </p>

          <Input
            label={
              existing ? "API key (leave blank to keep current)" : "API key"
            }
            name="api_key"
            type="password"
            placeholder="re_..."
            autoComplete="off"
            required={!existing}
          />

          <Input
            label="From address"
            name="from_address"
            type="text"
            required
            placeholder="Nautilus <noreply@yourdomain.com>"
            defaultValue={existing?.config?.from_address ?? ""}
            autoComplete="off"
          />

          <Input
            label="Reply-to (optional)"
            name="reply_to"
            type="email"
            placeholder="ops@yourdomain.com"
            defaultValue={existing?.config?.reply_to ?? ""}
            autoComplete="off"
          />
        </section>

        {/* ── Event subscriptions ───────────────────────────────── */}
        <section className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16">
          <header>
            <p className="label-text--lg">02 · Events to email</p>
            <p
              className="mono-sm text-text-muted mt-6"
              style={{ lineHeight: 1.6 }}
            >
              Pick which Nautilus events should email your workspace admins.
              Invite emails are sent automatically when Resend is connected and
              don&apos;t need to be enabled here.
            </p>
          </header>
          <ul className="flex flex-col gap-12">
            {INTEGRATION_EVENTS.map((e) => {
              const meta = EVENT_META[e];
              const checked = enabled.includes(e);
              return (
                <li key={e}>
                  <label className="flex items-start gap-12 cursor-pointer hairline-subtle hover:border-[var(--border-hover)] px-14 py-12 transition-colors">
                    <input
                      type="checkbox"
                      name="events"
                      value={e}
                      checked={checked}
                      onChange={() => toggleEvent(e)}
                      className="mt-2 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-text"
                        style={{
                          fontFamily: "var(--display)",
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        {meta.label}
                      </p>
                      <p
                        className="mono-sm text-text-muted mt-2"
                        style={{ lineHeight: 1.55 }}
                      >
                        {meta.description}
                      </p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        {state?.error && (
          <p
            role="alert"
            className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-14 py-12 mono-sm text-[var(--danger)] inline-flex items-start gap-8"
          >
            <AlertTriangle
              size={11}
              strokeWidth={1.5}
              className="mt-2 shrink-0"
            />
            <span>{state.error}</span>
          </p>
        )}
        {state?.success && (
          <p
            role="status"
            className="hairline-subtle border-[rgba(34,197,94,0.45)] bg-[var(--success-dim)] px-14 py-12 mono-sm text-[var(--success)] inline-flex items-start gap-8"
          >
            <Check size={11} strokeWidth={1.5} className="mt-2 shrink-0" />
            <span>{state.success}</span>
          </p>
        )}

        <footer className="flex items-center gap-10 flex-wrap">
          <CornerButton type="submit" variant="primary" loading={pending}>
            <Plug size={11} strokeWidth={1.5} />
            {existing ? "Update connection" : "Connect Resend"}
          </CornerButton>
          {existing && (
            <CornerButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              loading={disconnectPending}
            >
              <Unplug size={11} strokeWidth={1.5} />
              Disconnect
            </CornerButton>
          )}
        </footer>
      </form>

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="flex flex-col gap-16">
        <div className="hairline bg-[var(--surface)] p-20 flex flex-col gap-14">
          <p className="label-text text-text-muted">— Status</p>
          {existing ? (
            <>
              <dl className="flex flex-col gap-8 mono-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-text-dim">Connection</dt>
                  <dd
                    style={{
                      color:
                        existing.status === "connected"
                          ? "var(--success)"
                          : existing.status === "error"
                          ? "var(--danger)"
                          : "var(--text-muted)",
                    }}
                  >
                    {existing.status === "connected"
                      ? "Live"
                      : existing.status === "error"
                      ? "Errored"
                      : "Disconnected"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-12">
                  <dt className="text-text-dim shrink-0">From</dt>
                  <dd
                    className="text-text-secondary truncate text-right"
                    style={{ fontSize: 10 }}
                    title={existing.config?.from_address ?? ""}
                  >
                    {existing.config?.from_address ?? "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-text-dim">Event emails</dt>
                  <dd className="text-text-secondary tnum">
                    {existing.events_enabled.length}
                  </dd>
                </div>
                {existing.last_synced_at && (
                  <div className="flex items-center justify-between">
                    <dt className="text-text-dim">Last send</dt>
                    <dd className="text-text-secondary">
                      {new Date(existing.last_synced_at).toLocaleString(
                        "en-US",
                        { dateStyle: "short", timeStyle: "short" }
                      )}
                    </dd>
                  </div>
                )}
              </dl>
              {existing.last_error && (
                <p
                  className="mono-sm hairline-subtle px-10 py-8"
                  style={{
                    background: "var(--danger-dim)",
                    color: "var(--danger)",
                    lineHeight: 1.55,
                    fontSize: 10,
                  }}
                >
                  Last error: {existing.last_error}
                </p>
              )}
              <CornerButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleTest}
                loading={testPending}
              >
                <Zap size={11} strokeWidth={1.5} />
                Send test email
              </CornerButton>
              {testResult && (
                <p
                  className="mono-sm"
                  style={{
                    fontSize: 10,
                    color: testResult.ok ? "var(--success)" : "var(--danger)",
                  }}
                >
                  {testResult.ok
                    ? "✓ Test sent to your address"
                    : `✗ ${testResult.error ?? "Failed"}`}
                </p>
              )}
            </>
          ) : (
            <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
              Not connected yet. Paste a Resend API key + verified from-address
              to start sending.
            </p>
          )}
        </div>

        <div className="hairline-subtle p-16 flex flex-col gap-8">
          <p className="label-text text-text-muted inline-flex items-center gap-6">
            <Mail size={11} strokeWidth={1.5} /> What gets sent
          </p>
          <ul
            className="mono-sm text-text-dim flex flex-col gap-6"
            style={{
              lineHeight: 1.6,
              fontSize: 10,
              listStyle: "disc",
              paddingLeft: 16,
            }}
          >
            <li>
              Team invites — sent automatically to the invited email when an
              admin creates an invite
            </li>
            <li>Workspace onboarding teammate invites</li>
            <li>Selected event digests, emailed to all workspace admins</li>
          </ul>
        </div>

        <div className="hairline-subtle p-16 flex flex-col gap-8">
          <p className="label-text text-text-muted">— Domain verification</p>
          <p
            className="mono-sm text-text-dim"
            style={{ lineHeight: 1.6, fontSize: 10 }}
          >
            Resend requires the sending domain to pass SPF + DKIM checks. If
            test sends fail with a 422, head to your Resend dashboard → Domains
            and finish DNS setup.
          </p>
        </div>
      </aside>
    </div>
  );
}
