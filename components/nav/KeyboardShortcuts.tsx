"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface Shortcut {
  keys: string[];
  description: string;
}

interface Group {
  label: string;
  items: Shortcut[];
}

const SHORTCUTS: Group[] = [
  {
    label: "Navigation",
    items: [
      { keys: ["⌘", "K"], description: "Open command palette" },
      { keys: ["?"], description: "Show keyboard shortcuts" },
      { keys: ["Esc"], description: "Close any dialog or dropdown" },
    ],
  },
  {
    label: "Command palette",
    items: [
      { keys: ["↑"], description: "Move selection up" },
      { keys: ["↓"], description: "Move selection down" },
      { keys: ["↵"], description: "Activate selection" },
    ],
  },
];

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when user is typing in inputs
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      const isEditable =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable;

      if (e.key === "Escape" && open) {
        setOpen(false);
        return;
      }

      if (isEditable) return;

      // `?` (Shift+/) or Cmd+/
      if (
        (e.key === "?" && !e.metaKey && !e.ctrlKey) ||
        ((e.metaKey || e.ctrlKey) && e.key === "/")
      ) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onCustom = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-keyboard-shortcuts", onCustom);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-keyboard-shortcuts", onCustom);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcuts-title"
      className="fixed inset-0 flex items-start justify-center px-16 pt-[14vh]"
      style={{
        zIndex: 200,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-[520px] hairline bg-[var(--surface)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="hairline-b flex items-center justify-between px-16 py-12">
          <div>
            <p className="label-text text-text-muted">Help</p>
            <h2
              id="keyboard-shortcuts-title"
              className="text-text mt-2"
              style={{
                fontFamily: "var(--display)",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              Keyboard shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="hairline-subtle p-6 hover:border-[var(--border-hover)] text-text-secondary"
            aria-label="Close"
          >
            <X size={12} strokeWidth={1.5} />
          </button>
        </header>

        <div className="px-16 py-14 flex flex-col gap-20">
          {SHORTCUTS.map((group) => (
            <section key={group.label}>
              <p className="label-text text-text-muted mb-8">{group.label}</p>
              <ul className="flex flex-col gap-8">
                {group.items.map((s) => (
                  <li
                    key={s.description}
                    className="flex items-center justify-between gap-12"
                  >
                    <span className="text-text-secondary mono-sm">
                      {s.description}
                    </span>
                    <span className="inline-flex items-center gap-4 shrink-0">
                      {s.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="hairline-subtle px-7 py-2 text-text bg-[var(--surface-2)]"
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 10,
                            fontWeight: 500,
                            minWidth: 22,
                            textAlign: "center",
                            lineHeight: 1.4,
                          }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="hairline-t px-16 py-10">
          <p className="label-text text-text-dim">
            Press{" "}
            <kbd style={{ fontFamily: "var(--mono)", fontSize: 9 }}>?</kbd> any
            time to reopen
          </p>
        </footer>
      </div>
    </div>
  );
}
