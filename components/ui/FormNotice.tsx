import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

type Tone = "error" | "success" | "warning" | "info" | "accent";

const TONE: Record<Tone, { className: string; Icon: typeof Info }> = {
  error: {
    className:
      "border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)]",
    Icon: AlertTriangle,
  },
  success: {
    className:
      "border-[var(--success-border)] bg-[var(--success-dim)] text-[var(--success)]",
    Icon: CheckCircle2,
  },
  warning: {
    className:
      "border-[var(--warning-border)] bg-[var(--warning-dim)] text-[var(--warning)]",
    Icon: AlertTriangle,
  },
  info: {
    className:
      "border-[var(--info-border)] bg-[var(--info-dim)] text-[var(--info)]",
    Icon: Info,
  },
  accent: {
    className:
      "border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]",
    Icon: Info,
  },
};

interface Props {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

/**
 * Inline notice for a form — the error/success banner that 40-odd forms
 * were each hand-rolling. Errors announce as alerts; everything else is a
 * polite status. Renders a <div>, so callers can nest block content (a
 * copy-able invite link, a retry button) without invalid markup.
 */
export function FormNotice({ tone = "error", children, className }: Props) {
  const { className: toneClass, Icon } = TONE[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`hairline-subtle ${toneClass} px-14 py-12 mono-sm flex items-start gap-8 ${
        className ?? ""
      }`}
      style={{ lineHeight: 1.6 }}
    >
      <Icon size={11} strokeWidth={1.5} className="mt-2 shrink-0" aria-hidden />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
