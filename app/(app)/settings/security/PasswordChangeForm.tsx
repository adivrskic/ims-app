"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import { Check, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { PasswordStrength } from "@/components/auth/PasswordStrength";

export function PasswordChangeForm() {
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const reset = () => {
    setPassword("");
    setConfirm("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (password.length < 8) {
      setFeedback({
        kind: "error",
        message: "Password must be at least 8 characters",
      });
      return;
    }
    if (password !== confirm) {
      setFeedback({ kind: "error", message: "Passwords don't match" });
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setFeedback({ kind: "error", message: error.message });
      return;
    }
    reset();
    setFeedback({ kind: "success", message: "Password updated" });
  };

  return (
    <form
      onSubmit={submit}
      className="hairline bg-[var(--surface)] p-20 flex flex-col gap-14"
    >
      <header>
        <h3
          className="text-text"
          style={{
            fontFamily: "var(--display)",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Change password
        </h3>
        <p className="mono-sm text-text-muted mt-4">
          Pick something memorable but at least 8 characters. Your active
          sessions will stay signed in.
        </p>
      </header>

      <PasswordFieldRow
        label="New password"
        name="new_password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        required
      />

      {password.length > 0 && <PasswordStrength password={password} />}

      <PasswordFieldRow
        label="Confirm password"
        name="confirm_password"
        autoComplete="new-password"
        value={confirm}
        onChange={setConfirm}
        required
        error={
          confirm.length > 0 && password !== confirm
            ? "Passwords don't match"
            : undefined
        }
      />

      {feedback?.kind === "error" && (
        <p
          role="alert"
          className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-12 py-10 mono-sm text-[var(--danger)] inline-flex items-start gap-8"
        >
          <AlertTriangle
            size={11}
            strokeWidth={1.5}
            className="mt-2 shrink-0"
          />
          <span>{feedback.message}</span>
        </p>
      )}
      {feedback?.kind === "success" && (
        <p
          role="status"
          className="hairline-subtle border-[rgba(34,197,94,0.45)] bg-[var(--success-dim)] px-12 py-10 mono-sm text-[var(--success)] inline-flex items-center gap-8"
        >
          <Check size={11} strokeWidth={1.5} />
          <span>{feedback.message}</span>
        </p>
      )}

      <div className="flex items-center justify-end gap-10">
        <CornerButton
          type="submit"
          variant="primary"
          size="sm"
          loading={busy}
          disabled={!password || !confirm}
        >
          Update password →
        </CornerButton>
      </div>
    </form>
  );
}

/**
 * Local wrapper around <Input> that adds a show/hide eye button positioned
 * absolutely over the right side of the field. Avoids modifying the global
 * Input component for a feature only the password forms need.
 */
function PasswordFieldRow({
  label,
  name,
  autoComplete,
  value,
  onChange,
  required,
  error,
}: {
  label: string;
  name: string;
  autoComplete: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        label={label}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        error={error}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute text-text-muted hover:text-text transition-colors"
        style={{
          right: 12,
          top: 18,
          width: 24,
          height: 24,
          background: "transparent",
          border: 0,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        {visible ? (
          <EyeOff size={13} strokeWidth={1.5} />
        ) : (
          <Eye size={13} strokeWidth={1.5} />
        )}
      </button>
    </div>
  );
}
