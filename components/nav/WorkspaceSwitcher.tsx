"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Plus, Loader2 } from "lucide-react";
import { useDropdown } from "@/lib/useDropdown";
import { switchWorkspace } from "@/app/(app)/actions";

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
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handlePick = (orgId: string) => {
    if (orgId === current.id) {
      setOpen(false);
      return;
    }
    setOpen(false);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("org_id", orgId);
      const result = await switchWorkspace(fd);
      if (result.error) {
        // Surface in a future toast system. For now, fall back to a
        // refresh — the layout will re-render with the un-switched
        // workspace and the user sees that nothing changed.
        console.error("[workspace-switch]", result.error);
      }
      router.refresh();
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="flex items-center gap-8 hairline-subtle px-10 py-5 hover:border-[var(--border-hover)] transition-colors disabled:opacity-60"
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
        {pending ? (
          <Loader2
            size={10}
            strokeWidth={1.5}
            className="text-text-muted animate-spin"
          />
        ) : (
          <ChevronDown
            size={10}
            strokeWidth={1.5}
            className="text-text-muted"
          />
        )}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-8 w-[240px] hairline bg-[var(--surface)] flex flex-col"
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
                    onClick={() => handlePick(ws.id)}
                    disabled={pending}
                    className="w-full flex items-center gap-10 px-14 py-8 hover:bg-[var(--surface-2)] disabled:opacity-60 transition-colors text-left"
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
                    <div className="flex-1 min-w-0">
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
            <Link
              href="/workspaces/new"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-10 px-14 py-10 text-text-muted hover:text-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <Plus size={12} strokeWidth={1.5} />
              <span className="label-text">Create workspace</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
