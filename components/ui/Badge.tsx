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
  success: "border-[rgba(34,197,94,0.45)] text-[var(--success)]",
  warning: "border-[rgba(217,119,6,0.45)] text-[var(--warning)]",
  danger: "border-[rgba(239,68,68,0.45)] text-[var(--danger)]",
  info: "border-[rgba(96,165,250,0.45)] text-[var(--info)]",
};

const FILLED: Record<Tone, string> = {
  neutral: "bg-[var(--surface-2)] border-[var(--border-subtle)] text-text-secondary",
  accent: "bg-[var(--accent-dim)] border-[var(--accent-soft)] text-[var(--accent)]",
  success: "bg-[var(--success-dim)] border-[rgba(34,197,94,0.45)] text-[var(--success)]",
  warning: "bg-[var(--warning-dim)] border-[rgba(217,119,6,0.45)] text-[var(--warning)]",
  danger: "bg-[var(--danger-dim)] border-[rgba(239,68,68,0.45)] text-[var(--danger)]",
  info: "bg-[var(--info-dim)] border-[rgba(96,165,250,0.45)] text-[var(--info)]",
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
