import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

interface Props {
  children: ReactNode;
  tone?: Tone;
  variant?: "outline" | "filled";
  className?: string;
}

const OUTLINE: Record<Tone, string> = {
  neutral: "border-[var(--border)] text-text-secondary",
  accent: "border-[var(--accent-soft)] text-[var(--accent)]",
  success: "border-[var(--success-border)] text-[var(--success)]",
  warning: "border-[var(--warning-border)] text-[var(--warning)]",
  danger: "border-[var(--danger-border)] text-[var(--danger)]",
  info: "border-[var(--info-border)] text-[var(--info)]",
};

const FILLED: Record<Tone, string> = {
  neutral: "bg-[var(--surface-2)] border-[var(--border-subtle)] text-text-secondary",
  accent: "bg-[var(--accent-dim)] border-[var(--accent-soft)] text-[var(--accent)]",
  success: "bg-[var(--success-dim)] border-[var(--success-border)] text-[var(--success)]",
  warning: "bg-[var(--warning-dim)] border-[var(--warning-border)] text-[var(--warning)]",
  danger: "bg-[var(--danger-dim)] border-[var(--danger-border)] text-[var(--danger)]",
  info: "bg-[var(--info-dim)] border-[var(--info-border)] text-[var(--info)]",
};

export function Badge({
  children,
  tone = "neutral",
  variant = "outline",
  className,
}: Props) {
  const palette = variant === "filled" ? FILLED[tone] : OUTLINE[tone];
  return (
    <span
      className={`inline-flex items-center gap-6 px-8 py-4 border label-text ${palette} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
