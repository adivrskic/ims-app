import type { ReactNode } from "react";

interface MetaItem {
  label: string;
  value: ReactNode;
  status?: "live" | "online" | "offline" | "alert";
}

interface Props {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: MetaItem[];
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: Props) {
  const hasRight = (meta && meta.length > 0) || actions;
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-24 gap-y-12 pb-16 hairline-b">
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="label-text mb-6">{eyebrow}</p>}
        <h1
          className="text-text"
          style={{
            fontFamily: "var(--display)",
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.3px",
            lineHeight: 1.15,
          }}
        >
          {title}
        </h1>
        {description && (
          <p className="mono-sm text-text-muted mt-6 max-w-[560px]">
            {description}
          </p>
        )}
      </div>
      {hasRight && (
        <div className="flex items-center gap-x-20 gap-y-8 flex-wrap">
          {meta && meta.length > 0 && (
            <dl className="flex items-center gap-x-16 gap-y-4 flex-wrap">
              {meta.map((m, i) => (
                <div key={i} className="flex items-center gap-6">
                  {m.status && (
                    <span className={`dot dot-${m.status}`} aria-hidden />
                  )}
                  <dt className="label-text">{m.label}</dt>
                  <dd className="mono-sm text-text tnum">{m.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {actions && <div className="flex items-center gap-8">{actions}</div>}
        </div>
      )}
    </header>
  );
}
