"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  Pause,
  Play,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { EVENT_META } from "@/lib/integrations/types";
import { EndpointForm } from "./EndpointForm";
import {
  deleteWebhookEndpoint,
  testWebhookEndpoint,
  toggleWebhookEndpoint,
} from "./actions";

interface Endpoint {
  id: string;
  name: string;
  events_enabled: string[];
  status: "active" | "paused" | "error";
  last_delivered_at: string | null;
  last_error: string | null;
  total_deliveries: number;
  total_failures: number;
  created_at: string;
}

interface Props {
  endpoints: Endpoint[];
}

export function WebhooksClient({ endpoints }: Props) {
  const [adding, setAdding] = useState(false);
  const [showSecret, setShowSecret] = useState<{
    secret: string;
    endpointName: string;
  } | null>(null);

  return (
    <div className="flex flex-col gap-24">
      {/* Header row: count + add button */}
      <header className="flex items-center justify-between gap-12 flex-wrap">
        <p className="label-text text-text-muted">
          {endpoints.length} endpoint{endpoints.length === 1 ? "" : "s"}
        </p>
        {!adding && (
          <CornerButton
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setAdding(true)}
          >
            <Plus size={11} strokeWidth={1.5} />
            Add endpoint
          </CornerButton>
        )}
      </header>

      {/* Add form (inline) */}
      {adding && (
        <EndpointForm
          onCancel={() => setAdding(false)}
          onCreated={(secret, name) => {
            setAdding(false);
            setShowSecret({ secret, endpointName: name });
          }}
        />
      )}

      {/* Secret reveal modal */}
      {showSecret && (
        <SecretRevealCard
          secret={showSecret.secret}
          endpointName={showSecret.endpointName}
          onDismiss={() => setShowSecret(null)}
        />
      )}

      {/* List */}
      {endpoints.length === 0 && !adding ? (
        <EmptyState
          title="No webhook endpoints yet"
          description="Add an endpoint to forward Nautilus events to Zapier, n8n, Make, or your own backend."
          icon={<Zap size={20} strokeWidth={1.5} />}
        />
      ) : (
        <ul className="flex flex-col gap-12">
          {endpoints.map((endpoint) => (
            <EndpointRow key={endpoint.id} endpoint={endpoint} />
          ))}
        </ul>
      )}

      {/* Reference docs */}
      <DocsCard />
    </div>
  );
}

// ─── Endpoint row ──────────────────────────────────────────────────

function EndpointRow({ endpoint }: { endpoint: Endpoint }) {
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    status?: number;
    error?: string;
  } | null>(null);
  const [actionPending, startAction] = useTransition();

  const handleTest = () => {
    setTestResult(null);
    startAction(async () => {
      setTestResult(await testWebhookEndpoint(endpoint.id));
    });
  };

  const handleToggle = () => {
    startAction(async () => {
      await toggleWebhookEndpoint(endpoint.id);
    });
  };

  const handleDelete = () => {
    if (
      !confirm(
        `Delete the "${endpoint.name}" endpoint? Future events won't be sent.`
      )
    ) {
      return;
    }
    startAction(async () => {
      await deleteWebhookEndpoint(endpoint.id);
    });
  };

  const successRate =
    endpoint.total_deliveries > 0
      ? Math.round(
          ((endpoint.total_deliveries - endpoint.total_failures) /
            endpoint.total_deliveries) *
            100
        )
      : null;

  return (
    <li className="hairline bg-[var(--surface)] p-20 flex flex-col gap-14">
      {/* Top row: identity + status */}
      <header className="flex items-start justify-between gap-12 flex-wrap">
        <div className="min-w-0 flex-1">
          <p
            className="text-text truncate"
            style={{
              fontFamily: "var(--display)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {endpoint.name}
          </p>
          <p className="mono-sm text-text-muted mt-2" style={{ fontSize: 10 }}>
            Created{" "}
            {new Date(endpoint.created_at).toLocaleDateString("en-US", {
              dateStyle: "medium",
            })}
          </p>
        </div>
        <div className="flex items-center gap-8">
          {endpoint.status === "active" && (
            <Badge tone="success" variant="filled">
              <Check size={9} strokeWidth={1.5} />
              Active
            </Badge>
          )}
          {endpoint.status === "paused" && (
            <Badge tone="neutral" variant="filled">
              <Pause size={9} strokeWidth={1.5} />
              Paused
            </Badge>
          )}
          {endpoint.status === "error" && (
            <Badge tone="danger" variant="filled">
              <AlertTriangle size={9} strokeWidth={1.5} />
              Error
            </Badge>
          )}
        </div>
      </header>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-12 hairline-subtle bg-[var(--surface-2)] px-14 py-12">
        <Stat label="Events" value={String(endpoint.events_enabled.length)} />
        <Stat
          label="Deliveries"
          value={endpoint.total_deliveries.toLocaleString()}
        />
        <Stat
          label="Failures"
          value={endpoint.total_failures.toLocaleString()}
          tone={endpoint.total_failures > 0 ? "danger" : undefined}
        />
        <Stat
          label="Success rate"
          value={successRate !== null ? `${successRate}%` : "—"}
        />
      </div>

      {/* Event chips */}
      <div className="flex items-center gap-6 flex-wrap">
        {endpoint.events_enabled.map((e) => (
          <span
            key={e}
            className="hairline-subtle px-8 py-3 mono-sm text-text-secondary"
            style={{ fontSize: 9, letterSpacing: "0.4px" }}
          >
            {EVENT_META[e as keyof typeof EVENT_META]?.label ?? e}
          </span>
        ))}
      </div>

      {endpoint.last_error && (
        <p
          className="hairline-subtle mono-sm"
          style={{
            background: "var(--danger-dim)",
            color: "var(--danger)",
            padding: "10px 12px",
            fontSize: 10,
            lineHeight: 1.55,
          }}
        >
          <strong>Last error:</strong> {endpoint.last_error}
        </p>
      )}

      {testResult && (
        <p
          className="hairline-subtle mono-sm"
          style={{
            background: testResult.ok
              ? "var(--success-dim)"
              : "var(--danger-dim)",
            color: testResult.ok ? "var(--success)" : "var(--danger)",
            padding: "10px 12px",
            fontSize: 10,
            lineHeight: 1.55,
          }}
        >
          {testResult.ok
            ? `✓ Test delivered (HTTP ${testResult.status})`
            : `✗ ${testResult.error ?? `HTTP ${testResult.status}`}`}
        </p>
      )}

      {/* Actions */}
      <footer className="flex items-center gap-8 flex-wrap">
        <CornerButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleTest}
          loading={actionPending}
        >
          <Zap size={11} strokeWidth={1.5} />
          Test
        </CornerButton>
        <CornerButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleToggle}
          loading={actionPending}
        >
          {endpoint.status === "active" ? (
            <>
              <Pause size={11} strokeWidth={1.5} />
              Pause
            </>
          ) : (
            <>
              <Play size={11} strokeWidth={1.5} />
              Resume
            </>
          )}
        </CornerButton>
        <CornerButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          loading={actionPending}
        >
          <Trash2 size={11} strokeWidth={1.5} />
          Delete
        </CornerButton>
        {endpoint.last_delivered_at && (
          <span
            className="mono-sm text-text-dim ml-auto"
            style={{ fontSize: 10 }}
          >
            Last delivered{" "}
            {new Date(endpoint.last_delivered_at).toLocaleString("en-US", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
        )}
      </footer>
    </li>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="label-text text-text-dim" style={{ fontSize: 9 }}>
        {label}
      </span>
      <span
        className="tnum"
        style={{
          fontFamily: "var(--mono)",
          fontSize: 14,
          fontWeight: 500,
          color: tone === "danger" ? "var(--danger)" : "var(--text)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Secret reveal ─────────────────────────────────────────────────

function SecretRevealCard({
  secret,
  endpointName,
  onDismiss,
}: {
  secret: string;
  endpointName: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="hairline brackets p-24 flex flex-col gap-16"
      style={{
        background: "var(--accent-dim)",
        borderColor: "var(--accent)",
      }}
    >
      <header className="flex items-start gap-12">
        <span
          className="w-32 h-32 hairline-subtle bg-[var(--accent)] flex items-center justify-center shrink-0"
          aria-hidden
        >
          <Check size={14} strokeWidth={1.5} className="text-[var(--black)]" />
        </span>
        <div className="flex-1 min-w-0">
          <p
            style={{
              fontFamily: "var(--display)",
              fontSize: 18,
              fontWeight: 600,
              color: "var(--text)",
              margin: 0,
            }}
          >
            {endpointName} created
          </p>
          <p
            className="mono-sm text-text-muted mt-4"
            style={{ lineHeight: 1.6 }}
          >
            Copy the signing secret below — this is the ONLY time we&apos;ll
            show it. Receivers use this to verify the X-Nautilus-Signature
            header on every event.
          </p>
        </div>
      </header>

      <div className="hairline bg-[var(--bg)] p-14 flex items-center gap-12">
        <code
          className="mono-body text-text flex-1 break-all"
          style={{ fontSize: 11, lineHeight: 1.5 }}
        >
          {secret}
        </code>
        <CornerButton
          type="button"
          variant="primary"
          size="sm"
          onClick={handleCopy}
        >
          {copied ? "Copied" : "Copy"}
        </CornerButton>
      </div>

      <footer className="flex items-center justify-end">
        <CornerButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDismiss}
        >
          I&apos;ve saved it
        </CornerButton>
      </footer>
    </div>
  );
}

// ─── Docs card ─────────────────────────────────────────────────────

function DocsCard() {
  return (
    <details className="hairline-subtle p-16">
      <summary
        className="label-text cursor-pointer select-none text-text-muted hover:text-text"
        style={{ listStyle: "none" }}
      >
        Receiver implementation guide →
      </summary>
      <div
        className="mono-sm text-text-muted mt-12"
        style={{ lineHeight: 1.7 }}
      >
        <p style={{ marginBottom: 12 }}>
          Every event POSTs to your URL with these headers:
        </p>
        <pre
          className="hairline-subtle bg-[var(--surface-2)] p-12 my-8 overflow-x-auto"
          style={{ fontSize: 10 }}
        >
          {`POST <your-url>
Content-Type: application/json
User-Agent: Nautilus-Webhook/1.0
X-Nautilus-Event: low_stock
X-Nautilus-Delivery: 5e2a...
X-Nautilus-Timestamp: 1716234567
X-Nautilus-Signature: sha256=<hex>`}
        </pre>
        <p style={{ marginBottom: 12 }}>
          To verify: HMAC-SHA256 the raw body with your endpoint&apos;s signing
          secret, hex-encode it, and prepend <code>sha256=</code>. Compare to
          the signature header in constant time.
        </p>
        <pre
          className="hairline-subtle bg-[var(--surface-2)] p-12 my-8 overflow-x-auto"
          style={{ fontSize: 10 }}
        >
          {`// Node.js example
import { createHmac, timingSafeEqual } from 'crypto';

function verify(rawBody, signatureHeader, secret) {
  const expected = 'sha256=' + createHmac('sha256', secret)
    .update(rawBody).digest('hex');
  return timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  );
}`}
        </pre>
        <p>
          Reject deliveries whose <code>X-Nautilus-Timestamp</code> is more than
          5 minutes old to prevent replay attacks. Use the{" "}
          <code>X-Nautilus-Delivery</code> header as an idempotency key if your
          handler is non-idempotent.
        </p>
      </div>
    </details>
  );
}
