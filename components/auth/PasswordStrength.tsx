"use client";

import { Check } from "lucide-react";

interface Props {
  /** Current password value. Empty string is treated as "not yet typed". */
  password: string;
  /** Show the requirements checklist (default true). */
  showRequirements?: boolean;
}

type StrengthScore = 0 | 1 | 2 | 3 | 4;

interface Strength {
  score: StrengthScore;
  label: string;
  /** CSS color for the meter segments + label. */
  color: string;
  checks: {
    length: boolean;
    mixedCase: boolean;
    digit: boolean;
    special: boolean;
  };
}

interface StrengthMeta {
  label: string;
  color: string;
}

const META: { [K in StrengthScore]: StrengthMeta } = {
  0: { label: "—", color: "var(--text-dim)" },
  1: { label: "Weak", color: "var(--danger)" },
  2: { label: "Fair", color: "var(--warning)" },
  3: { label: "Good", color: "var(--accent)" },
  4: { label: "Strong", color: "var(--success)" },
};

/**
 * Lightweight password strength heuristic — no zxcvbn dep.
 *
 * Score breakdown (each adds 1, capped at 4):
 *   - length >= 8
 *   - length >= 12 OR has 3+ character classes
 *   - mixed case AND digit
 *   - special char OR length >= 16
 *
 * Intentionally permissive about exact rules. The goal is a directional
 * signal ("you're getting there") not a hard gate — the server still
 * enforces the minLength=8 floor.
 */
export function evaluatePassword(password: string): Strength {
  const checks = {
    length: password.length >= 8,
    mixedCase: /[a-z]/.test(password) && /[A-Z]/.test(password),
    digit: /\d/.test(password),
    special: /[^a-zA-Z0-9]/.test(password),
  };

  let score = 0;
  if (password.length >= 8) score++;
  if (
    password.length >= 12 ||
    Object.values(checks).filter(Boolean).length >= 3
  ) {
    score++;
  }
  if (checks.mixedCase && checks.digit) score++;
  if (checks.special || password.length >= 16) score++;

  // Floor common weak passwords back to 1 even if they pass character classes.
  if (
    password.length > 0 &&
    /^(password|qwerty|letmein|welcome|admin|123456)/i.test(password)
  ) {
    score = 1;
  }

  // Empty: special "0" state used to suppress the meter visually.
  if (password.length === 0) score = 0;

  const clamped = score as StrengthScore;
  return {
    score: clamped,
    label: META[clamped].label,
    color: META[clamped].color,
    checks,
  };
}

export function PasswordStrength({ password, showRequirements = true }: Props) {
  const { score, label, color, checks } = evaluatePassword(password);
  const empty = password.length === 0;

  return (
    <div className="flex flex-col gap-10" aria-live="polite">
      {/* Meter */}
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3 flex-1">
          {[1, 2, 3, 4].map((seg) => {
            const filled = !empty && score >= seg;
            return (
              <span
                key={seg}
                aria-hidden
                style={{
                  flex: 1,
                  height: 2,
                  background: filled ? color : "var(--border)",
                  transition: "background var(--dur-quick) var(--ease-out)",
                }}
              />
            );
          })}
        </div>
        <span
          className="label-text tnum shrink-0"
          style={{
            color: empty ? "var(--text-dim)" : color,
            minWidth: 56,
            textAlign: "right",
          }}
        >
          {empty ? "Strength" : label}
        </span>
      </div>

      {showRequirements && (
        <ul
          className="grid grid-cols-2 gap-x-14 gap-y-6"
          aria-label="Password requirements"
        >
          <Requirement met={checks.length} label="8+ characters" />
          <Requirement met={checks.mixedCase} label="Mixed case" />
          <Requirement met={checks.digit} label="Number" />
          <Requirement met={checks.special} label="Special char" />
        </ul>
      )}
    </div>
  );
}

function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <li
      className="flex items-center gap-6"
      style={{ color: met ? "var(--success)" : "var(--text-dim)" }}
    >
      <span
        aria-hidden
        className="inline-flex items-center justify-center"
        style={{
          width: 11,
          height: 11,
          border: `1px solid ${met ? "var(--success)" : "var(--border)"}`,
          background: met ? "var(--success-dim)" : "transparent",
          transition: "all var(--dur-quick) var(--ease-out)",
        }}
      >
        {met && <Check size={8} strokeWidth={2} />}
      </span>
      <span
        className="mono-sm"
        style={{ fontSize: 10, letterSpacing: "0.4px" }}
      >
        {label}
      </span>
    </li>
  );
}
