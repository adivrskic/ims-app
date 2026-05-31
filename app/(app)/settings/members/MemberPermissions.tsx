"use client";

import { useState } from "react";
import { ShieldCheck, ChevronDown } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { PERMISSIONS } from "@/lib/permissions";
import { setMemberPermissions } from "../actions";

interface Props {
  userId: string;
  current: string[];
  isCustom: boolean;
}

const GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];

export function MemberPermissions({ userId, current, isCustom }: Props) {
  const [open, setOpen] = useState(false);
  const currentSet = new Set(current);

  return (
    <div className="ml-42">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors"
        aria-expanded={open}
      >
        <ShieldCheck size={11} strokeWidth={1.5} />
        <span className="label-text">
          Permissions{" "}
          {isCustom ? (
            <span className="text-[var(--accent)]">· custom</span>
          ) : (
            <span className="text-text-dim">· role default</span>
          )}
        </span>
        <ChevronDown
          size={11}
          strokeWidth={1.5}
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      {open && (
        <form action={setMemberPermissions} className="mt-10 flex flex-col gap-12">
          <input type="hidden" name="user_id" value={userId} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-16 gap-y-10">
            {GROUPS.map((group) => (
              <div key={group} className="flex flex-col gap-4">
                <span className="label-text text-text-dim">{group}</span>
                {PERMISSIONS.filter((p) => p.group === group).map((p) => (
                  <label
                    key={p.key}
                    className="flex items-center gap-6 mono-sm text-text-secondary select-none cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      name="perm"
                      value={p.key}
                      defaultChecked={currentSet.has(p.key)}
                      className="accent-[var(--accent)]"
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-8">
            <CornerButton type="submit" variant="primary" size="sm">
              Save permissions
            </CornerButton>
            <button
              type="submit"
              name="reset"
              value="1"
              className="hairline-subtle px-10 py-6 text-text-secondary hover:text-text hover:border-[var(--border-hover)] transition-colors"
              style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.8px", textTransform: "uppercase" }}
            >
              Reset to role default
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
