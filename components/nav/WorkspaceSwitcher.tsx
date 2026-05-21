"use client";

import { ChevronDown, Check, Plus } from "lucide-react";
import { useDropdown } from "@/lib/useDropdown";

export interface WorkspaceOption {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface Props {
  current: WorkspaceOption;
  workspaces: WorkspaceOption[];
}

export function WorkspaceSwitcher({ current, workspaces }: Props) {
  const { open, setOpen, ref } = useDropdown<HTMLDivElement>();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-8 hairline-subtle px-10 py-5 hover:border-[var(--border-hover)] transition-colors"
        aria-label="Switch workspace"
        aria-expanded={open}
      >
        <span className="w-14 h-14 bg-[var(--accent-dim)] flex items-center justify-center shrink-0">
          <span
            className="text-[var(--accent)]"
            style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600 }}
          >
            {current.name.slice(0, 1).toUpperCase()}
          </span>
        </span>
        <span className="label-text text-text">{current.name}</span>
        <ChevronDown size={10} strokeWidth={1.5} className="text-text-muted" />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-8 w-[220px] hairline bg-[var(--surface)] flex flex-col"
          style={{ zIndex: 50 }}
        >
          <p className="px-14 py-8 hairline-b label-text text-text-muted">
            Workspaces
          </p>

          <ul className="py-4">
            {workspaces.map((ws) => {
              const isCurrent = ws.id === current.id;
              return (
                <li key={ws.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="w-full flex items-center gap-10 px-14 py-8 hover:bg-[var(--surface-2)] transition-colors"
                    aria-current={isCurrent ? "true" : undefined}
                  >
                    <span className="w-16 h-16 bg-[var(--accent-dim)] flex items-center justify-center shrink-0">
                      <span
                        className="text-[var(--accent)]"
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        {ws.name.slice(0, 1).toUpperCase()}
                      </span>
                    </span>
                    <div className="flex-1 min-w-0 text-left">
                      <p
                        className="text-text truncate"
                        style={{
                          fontFamily: "var(--display)",
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        {ws.name}
                      </p>
                      <p
                        className="mono-sm text-text-muted truncate"
                        style={{ fontSize: 10 }}
                      >
                        {ws.role}
                      </p>
                    </div>
                    {isCurrent && (
                      <Check
                        size={12}
                        strokeWidth={1.5}
                        className="text-[var(--accent)] shrink-0"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="hairline-t">
            <button
              type="button"
              className="w-full flex items-center gap-10 px-14 py-10 text-text-muted hover:text-text hover:bg-[var(--surface-2)] transition-colors"
              onClick={() => setOpen(false)}
              disabled
              title="Workspace creation coming soon"
            >
              <Plus size={12} strokeWidth={1.5} />
              <span className="label-text">Create workspace</span>
              <span className="ml-auto label-text text-text-dim">Soon</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
