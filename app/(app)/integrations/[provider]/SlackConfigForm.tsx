"use client";

import { useActionState, useState, useTransition } from "react";
import { AlertTriangle, Check, Plug, Unplug, Zap } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import {
  INTEGRATION_EVENTS,
  EVENT_META,
  type IntegrationEvent,
} from "@/lib/integrations/types";
import {
  connectSlack,
  disconnectSlack,
  reTestSlack,
  type ConnectResult,
} from "./actions";

interface Props {
  existing: {
    status: "connected" | "error" | "disconnected";
    config: { bot_name?: string | null };
    events_enabled: string[];
    last_synced_at: string | null;
    last_error: string | null;
  } | null;
}

export function SlackConfigForm({ existing }: Props) {
  const [state, formAction, pending] = useActionState<
    ConnectResult | undefined,
    FormData
  >(connectSlack, undefined);

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
      setTestResult(await reTestSlack());
    });
  };

  const handleDisconnect = () => {
    if (
      !confirm(
        "Disconnect Slack? Future alerts won't reach your channel until you reconnect."
      )
    ) {
      return;
    }
    startDisconnect(async () => {
      await disconnectSlack();
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
        {/* ── Connection ────────────────────────────────────────── */}
        <section className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16">
          <header className="flex items-baseline justify-between gap-12">
            <p className="label-text--lg">01 · Webhook URL</p>
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
            In Slack, go to{" "}
            <strong>Apps → Incoming Webhooks → Add to Slack</strong>, choose the
            channel that should receive Nautilus alerts, and copy the generated
            webhook URL. Paste it below.
          </p>
          <Input
            label="Webhook URL"
            name="webhook_url"
            type="url"
            placeholder="https://hooks.slack.com/services/T000/B000/xxxxx"
            required
            autoComplete="off"
            // Always blank — the existing value is encrypted server-side
            // and never round-trips to the client. Submitting blank
            // requires re-pasting if they want to change it.
          />
          {existing && (
            <p
              className="mono-sm text-text-dim"
              style={{ fontSize: 10, lineHeight: 1.55 }}
            >
              An existing webhook is stored. Paste a new one to replace it.
            </p>
          )}
          <Input
            label="Bot display name (optional)"
            name="bot_name"
            type="text"
            placeholder="Nautilus"
            defaultValue={existing?.config?.bot_name ?? ""}
          />
        </section>

        {/* ── Event subscriptions ──────────────────────────────── */}
        <section className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16">
          <header>
            <p className="label-text--lg">02 · Events to forward</p>
            <p
              className="mono-sm text-text-muted mt-6"
              style={{ lineHeight: 1.6 }}
            >
              Pick which Nautilus events should post to your Slack channel.
              Unchecked events are still tracked in Nautilus — they just
              don&apos;t leave the app.
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

        {/* ── Feedback ─────────────────────────────────────────── */}
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
            {existing ? "Update connection" : "Connect Slack"}
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

      {/* ── Status sidebar ────────────────────────────────────── */}
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
                <div className="flex items-center justify-between">
                  <dt className="text-text-dim">Events forwarded</dt>
                  <dd className="text-text-secondary tnum">
                    {existing.events_enabled.length}
                  </dd>
                </div>
                {existing.last_synced_at && (
                  <div className="flex items-center justify-between">
                    <dt className="text-text-dim">Last delivery</dt>
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
                Send test message
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
                    ? "✓ Test sent"
                    : `✗ ${testResult.error ?? "Failed"}`}
                </p>
              )}
            </>
          ) : (
            <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
              Not connected yet. Paste a webhook URL above and pick the events
              you want forwarded.
            </p>
          )}
        </div>

        <div className="hairline-subtle p-16 flex flex-col gap-8">
          <p className="label-text text-text-muted">— Security</p>
          <p
            className="mono-sm text-text-dim"
            style={{ lineHeight: 1.6, fontSize: 10 }}
          >
            Webhook URLs are encrypted at rest (AES-256-GCM). Anyone with the
            URL itself can post to your channel — rotate it from Slack&apos;s
            app settings if it ever leaks.
          </p>
        </div>
      </aside>
    </div>
  );
}
