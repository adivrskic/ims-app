"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import { FormSection } from "@/components/ui/FormSection";
import { FormActions } from "@/components/ui/FormActions";
import { FormNotice } from "@/components/ui/FormNotice";
import { Eye, EyeOff } from "lucide-react";
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
    <form onSubmit={submit}>
      <FormSection
        title="Change password"
        description="Pick something memorable but at least 8 characters. Your active sessions will stay signed in."
      >
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
          <FormNotice>{feedback.message}</FormNotice>
        )}
        {feedback?.kind === "success" && (
          <FormNotice tone="success">{feedback.message}</FormNotice>
        )}

        <FormActions>
          <CornerButton
            type="submit"
            variant="primary"
            size="sm"
            loading={busy}
            disabled={!password || !confirm}
          >
            Update password →
          </CornerButton>
        </FormActions>
      </FormSection>
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
          // Centred in the 40px control shell, which sits below the static
          // label row (~14px) and the field's 6px gap: 14 + 6 + (40 − 24) / 2.
          right: 12,
          top: 28,
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
