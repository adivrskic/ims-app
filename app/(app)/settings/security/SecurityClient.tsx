"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  ShieldCheck,
  Smartphone,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";

interface MfaFactor {
  id: string;
  factor_type: string;
  status: "verified" | "unverified";
  friendly_name?: string;
  created_at: string;
}

type Stage =
  | { kind: "idle" }
  | {
      kind: "scanning";
      factorId: string;
      qrCode: string; // SVG
      secret: string;
      uri: string;
    }
  | { kind: "verifying"; factorId: string; challengeId: string }
  | { kind: "error"; message: string };

export function SecurityClient() {
  const [factors, setFactors] = useState<MfaFactor[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const supabase = createClient();

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setStage({ kind: "error", message: error.message });
      setLoading(false);
      return;
    }
    // Both totp and phone factors are listed; we only handle totp here
    const totp = (data?.totp ?? []) as MfaFactor[];
    setFactors(totp);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const startEnrollment = async () => {
    setBusy(true);
    const friendlyName = `Authenticator · ${new Date().toLocaleDateString(
      undefined,
      { month: "short", day: "numeric", year: "numeric" }
    )}`;
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName,
    });
    setBusy(false);
    if (error || !data) {
      setStage({
        kind: "error",
        message: error?.message ?? "Failed to start enrollment",
      });
      return;
    }
    setStage({
      kind: "scanning",
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    });
  };

  const proceedToVerify = async () => {
    if (stage.kind !== "scanning") return;
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.challenge({
      factorId: stage.factorId,
    });
    setBusy(false);
    if (error || !data) {
      setStage({
        kind: "error",
        message: error?.message ?? "Failed to start challenge",
      });
      return;
    }
    setStage({
      kind: "verifying",
      factorId: stage.factorId,
      challengeId: data.id,
    });
    setCode("");
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stage.kind !== "verifying") return;
    if (code.length !== 6) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.verify({
      factorId: stage.factorId,
      challengeId: stage.challengeId,
      code,
    });
    setBusy(false);
    if (error) {
      setStage({ kind: "error", message: error.message });
      return;
    }
    setStage({ kind: "idle" });
    setCode("");
    refresh();
  };

  const cancelEnrollment = async () => {
    if (stage.kind === "scanning" || stage.kind === "verifying") {
      // Clean up the unverified factor
      await supabase.auth.mfa.unenroll({ factorId: stage.factorId });
    }
    setStage({ kind: "idle" });
    setCode("");
    refresh();
  };

  const removeFactor = async (factorId: string) => {
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) {
      setStage({ kind: "error", message: error.message });
      return;
    }
    refresh();
  };

  const copySecret = async () => {
    if (stage.kind !== "scanning") return;
    try {
      await navigator.clipboard.writeText(stage.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 1500);
    } catch {
      // ignore
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="hairline bg-[var(--surface)] px-20 py-24">
        <p className="mono-sm text-text-muted">
          Loading authentication factors…
        </p>
      </div>
    );
  }

  const verified = (factors ?? []).filter((f) => f.status === "verified");

  return (
    <div className="flex flex-col gap-16">
      {/* Active factors */}
      {verified.length > 0 && (
        <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
          {verified.map((f) => (
            <li
              key={f.id}
              className="px-20 py-14 flex items-center gap-14 row-interactive"
            >
              <span
                className="w-28 h-28 hairline-subtle bg-[var(--success-dim)] flex items-center justify-center shrink-0 text-[var(--success)]"
                aria-hidden
              >
                <ShieldCheck size={12} strokeWidth={1.5} />
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-text truncate"
                  style={{
                    fontFamily: "var(--display)",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {f.friendly_name || "Authenticator app"}
                </p>
                <p className="mono-sm text-text-muted">
                  TOTP · Enrolled {new Date(f.created_at).toLocaleDateString()}
                </p>
              </div>
              <Badge tone="success" variant="filled">
                Active
              </Badge>
              <CornerButton
                type="button"
                variant="danger"
                size="sm"
                onClick={() => removeFactor(f.id)}
                loading={busy}
                ariaLabel={`Remove ${f.friendly_name}`}
              >
                Remove
              </CornerButton>
            </li>
          ))}
        </ul>
      )}

      {/* No factors → idle: show enable CTA */}
      {verified.length === 0 && stage.kind === "idle" && (
        <div className="hairline bg-[var(--surface)] p-20 flex flex-col gap-14">
          <div className="flex items-start gap-14">
            <span
              className="w-36 h-36 hairline-subtle bg-[var(--surface-2)] flex items-center justify-center shrink-0 text-text-muted"
              aria-hidden
            >
              <Smartphone size={16} strokeWidth={1.5} />
            </span>
            <div className="flex-1">
              <h3
                className="text-text"
                style={{
                  fontFamily: "var(--display)",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Two-factor authentication is off
              </h3>
              <p
                className="mono-sm text-text-muted mt-4"
                style={{ lineHeight: 1.6 }}
              >
                Add a one-time code from an authenticator app (1Password, Authy,
                Google Authenticator, etc.) on top of your password. Recommended
                for owners and admins managing sensitive inventory.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <CornerButton
              type="button"
              variant="primary"
              size="sm"
              onClick={startEnrollment}
              loading={busy}
            >
              Enable 2FA →
            </CornerButton>
          </div>
        </div>
      )}

      {/* Scanning: show QR + secret + continue */}
      {stage.kind === "scanning" && (
        <div className="hairline border-[var(--accent-soft)] bg-[var(--surface)] p-20 flex flex-col gap-16">
          <div>
            <p className="label-text text-[var(--accent)]">Step 1 of 2</p>
            <h3
              className="text-text mt-4"
              style={{
                fontFamily: "var(--display)",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              Scan with your authenticator app
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-20 items-start">
            <div
              className="hairline-subtle bg-white p-8 shrink-0"
              style={{ width: 180, height: 180 }}
              dangerouslySetInnerHTML={{ __html: stage.qrCode }}
              aria-label="2FA QR code"
            />
            <div className="flex flex-col gap-12">
              <div>
                <p className="label-text text-text-muted">
                  Or enter this secret manually
                </p>
                <div className="hairline-subtle bg-[var(--bg)] mt-6 px-12 py-10 flex items-center gap-10">
                  <code
                    className="flex-1 text-text break-all"
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 13,
                      letterSpacing: "0.5px",
                    }}
                  >
                    {stage.secret}
                  </code>
                  <button
                    type="button"
                    onClick={copySecret}
                    className="hairline-subtle px-10 py-5 hover:border-[var(--accent)] text-text-muted hover:text-[var(--accent)] inline-flex items-center gap-6 transition-colors shrink-0"
                    aria-label="Copy secret"
                  >
                    {copiedSecret ? (
                      <Check size={11} strokeWidth={1.5} />
                    ) : (
                      <Copy size={11} strokeWidth={1.5} />
                    )}
                    <span className="label-text">
                      {copiedSecret ? "Copied" : "Copy"}
                    </span>
                  </button>
                </div>
              </div>
              <p
                className="mono-sm text-text-muted"
                style={{ lineHeight: 1.6 }}
              >
                Once added, your app will generate a 6-digit code every 30
                seconds. On the next step we&apos;ll ask you to verify with one
                of those codes.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-10 hairline-t pt-14">
            <CornerButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelEnrollment}
            >
              Cancel
            </CornerButton>
            <CornerButton
              type="button"
              variant="primary"
              size="sm"
              onClick={proceedToVerify}
              loading={busy}
            >
              I&apos;ve added it →
            </CornerButton>
          </div>
        </div>
      )}

      {/* Verifying: code entry */}
      {stage.kind === "verifying" && (
        <form
          onSubmit={verifyCode}
          className="hairline border-[var(--accent-soft)] bg-[var(--surface)] p-20 flex flex-col gap-16"
        >
          <div>
            <p className="label-text text-[var(--accent)]">Step 2 of 2</p>
            <h3
              className="text-text mt-4"
              style={{
                fontFamily: "var(--display)",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              Verify the code from your app
            </h3>
            <p className="mono-sm text-text-muted mt-6">
              Enter the current 6-digit code your authenticator is showing.
            </p>
          </div>

          <Input
            label="Code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            maxLength={6}
            required
            placeholder="123 456"
          />

          <div className="flex items-center justify-end gap-10 hairline-t pt-14">
            <CornerButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelEnrollment}
            >
              Cancel
            </CornerButton>
            <CornerButton
              type="submit"
              variant="primary"
              size="sm"
              loading={busy}
              disabled={code.length !== 6}
            >
              Verify + enable →
            </CornerButton>
          </div>
        </form>
      )}

      {/* Error state */}
      {stage.kind === "error" && (
        <div
          role="alert"
          className="hairline border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] p-16 flex items-start gap-12"
        >
          <AlertTriangle
            size={14}
            strokeWidth={1.5}
            className="text-[var(--danger)] shrink-0 mt-2"
          />
          <div className="flex-1">
            <p
              className="text-[var(--danger)]"
              style={{
                fontFamily: "var(--display)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Something went wrong
            </p>
            <p className="mono-sm text-text-secondary mt-4">{stage.message}</p>
          </div>
          <CornerButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setStage({ kind: "idle" });
              refresh();
            }}
          >
            Try again
          </CornerButton>
        </div>
      )}
    </div>
  );
}
