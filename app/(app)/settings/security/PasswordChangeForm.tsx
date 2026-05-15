"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { CornerButton } from "@/components/ui/CornerButton";
import { Check, AlertTriangle } from "lucide-react";

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

      <Input
        label="New password"
        name="new_password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <Input
        label="Confirm password"
        name="confirm_password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
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
