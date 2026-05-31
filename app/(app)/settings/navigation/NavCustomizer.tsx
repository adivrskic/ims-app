"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, Eye, EyeOff, RotateCcw } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { ALL_NAV_ITEMS, type NavPrefs } from "@/lib/navData";
import { saveNavPrefs, resetNavPrefs } from "./actions";

// Mirrors ALWAYS_PRIMARY in lib/industries — these can't be hidden.
const LOCKED = new Set(["overview", "settings"]);

interface Props {
  /** Effective current prefs (saved prefs, or the industry defaults). */
  initialPrefs: NavPrefs;
  /** Whether the user has explicitly customized (vs. industry defaults). */
  isCustom: boolean;
  /** Industry label for the reset hint, or null. */
  industryLabel: string | null;
}

interface Row {
  key: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  hidden: boolean;
}

export function NavCustomizer({ initialPrefs, isCustom, industryLabel }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  const byKey = useMemo(
    () => new Map(ALL_NAV_ITEMS.map((i) => [i.key, i])),
    []
  );

  const [rows, setRows] = useState<Row[]>(() => {
    const hiddenSet = new Set(initialPrefs.hidden);
    const ordered = initialPrefs.order.filter((k) => byKey.has(k));
    const missing = ALL_NAV_ITEMS.filter(
      (i) => !initialPrefs.order.includes(i.key)
    ).map((i) => i.key);
    return [...ordered, ...missing].map((k) => {
      const item = byKey.get(k)!;
      return { key: k, label: item.label, Icon: item.icon, hidden: hiddenSet.has(k) };
    });
  });

  const move = (idx: number, dir: -1 | 1) => {
    setRows((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    setMsg(null);
  };

  const toggle = (key: string) => {
    if (LOCKED.has(key)) return;
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, hidden: !r.hidden } : r))
    );
    setMsg(null);
  };

  const save = () => {
    startTransition(async () => {
      const res = await saveNavPrefs({
        order: rows.map((r) => r.key),
        hidden: rows.filter((r) => r.hidden).map((r) => r.key),
      });
      if (res.error) setMsg({ kind: "err", text: res.error });
      else {
        setMsg({ kind: "ok", text: res.success ?? "Saved" });
        router.refresh();
      }
    });
  };

  const reset = () => {
    startTransition(async () => {
      const res = await resetNavPrefs();
      if (res.error) setMsg({ kind: "err", text: res.error });
      else router.refresh();
    });
  };

  const visibleCount = rows.filter((r) => !r.hidden).length;

  return (
    <div className="flex flex-col gap-16">
      <div className="hairline bg-[var(--surface)] overflow-hidden">
        <header className="px-16 py-12 hairline-b flex items-center justify-between gap-12">
          <div>
            <p className="label-text text-text-muted">Sidebar items</p>
            <p className="mono-sm text-text-dim mt-2">
              {visibleCount} shown · {rows.length - visibleCount} in “More”
            </p>
          </div>
          <span className="mono-sm text-text-dim">
            {isCustom
              ? "Customized"
              : industryLabel
              ? `${industryLabel} defaults`
              : "Default"}
          </span>
        </header>

        <ul className="divide-y divide-[var(--border-subtle)]">
          {rows.map((row, idx) => {
            const locked = LOCKED.has(row.key);
            const Icon = row.Icon;
            return (
              <li
                key={row.key}
                className={`flex items-center gap-12 px-16 py-10 ${
                  row.hidden ? "opacity-45" : ""
                }`}
              >
                <span className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="text-text-dim hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label={`Move ${row.label} up`}
                  >
                    <ChevronUp size={12} strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={idx === rows.length - 1}
                    className="text-text-dim hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label={`Move ${row.label} down`}
                  >
                    <ChevronDown size={12} strokeWidth={1.5} />
                  </button>
                </span>

                <Icon size={14} strokeWidth={1.5} />
                <span
                  className="flex-1 text-text"
                  style={{ fontFamily: "var(--display)", fontSize: 13 }}
                >
                  {row.label}
                </span>

                <button
                  type="button"
                  onClick={() => toggle(row.key)}
                  disabled={locked}
                  className={`hairline-subtle p-6 transition-colors ${
                    locked
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:border-[var(--border-hover)] text-text-muted hover:text-text"
                  }`}
                  aria-label={
                    locked
                      ? `${row.label} is always shown`
                      : row.hidden
                      ? `Show ${row.label}`
                      : `Hide ${row.label}`
                  }
                  title={locked ? "Always shown" : row.hidden ? "Hidden" : "Shown"}
                >
                  {row.hidden ? (
                    <EyeOff size={12} strokeWidth={1.5} />
                  ) : (
                    <Eye size={12} strokeWidth={1.5} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {msg && (
        <p
          role={msg.kind === "err" ? "alert" : "status"}
          className={`hairline-subtle px-12 py-10 mono-sm ${
            msg.kind === "err"
              ? "border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] text-[var(--danger)]"
              : "border-[rgba(34,197,94,0.45)] bg-[var(--success-dim)] text-[var(--success)]"
          }`}
        >
          {msg.text}
        </p>
      )}

      <div className="flex items-center justify-between gap-10 flex-wrap">
        <button
          type="button"
          onClick={reset}
          disabled={pending || !isCustom}
          className="inline-flex items-center gap-6 text-text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          style={{ fontFamily: "var(--mono)", fontSize: 11 }}
        >
          <RotateCcw size={11} strokeWidth={1.5} />
          Reset to {industryLabel ?? "default"}
        </button>
        <CornerButton
          type="button"
          variant="primary"
          size="sm"
          loading={pending}
          onClick={save}
        >
          Save navigation
        </CornerButton>
      </div>
    </div>
  );
}
