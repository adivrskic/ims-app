"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Building2, Check, ChevronRight, Layers, Settings } from "lucide-react";
import { setCurrentFacility } from "@/app/(app)/actions";
import type { FacilityOption } from "@/lib/currentFacility";

interface Props {
  label: string;
  // Matches the nav-data icon type in SideRail (lucide icons are assignable).
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  manageHref: string;
  active: boolean;
  collapsed: boolean;
  facilities: FacilityOption[];
  currentFacilityId: string | null;
}

export function FacilitiesNavItem({
  label,
  icon: Icon,
  manageHref,
  active,
  collapsed,
  facilities,
  currentFacilityId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = facilities.find((f) => f.id === currentFacilityId) ?? null;
  const isAllMode = currentFacilityId === null;

  const handleSelect = (idOrAll: string) => {
    setOpen(false);
    startTransition(() => {
      const fd = new FormData();
      fd.append("id", idOrAll);
      setCurrentFacility(fd);
    });
  };

  return (
    <li ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={
          collapsed
            ? `${label} — ${current?.name ?? "All facilities"}`
            : undefined
        }
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative flex items-center w-full transition-all duration-200 ${
          collapsed ? "justify-center h-32" : "gap-10 px-10 py-7"
        } ${
          active
            ? "bg-[var(--accent-dim)] text-[var(--accent)]"
            : "text-text-secondary hover:text-text hover:bg-[var(--surface-2)]"
        }`}
      >
        {active && !collapsed && (
          <span
            className="absolute left-0 top-0 bottom-0 w-px bg-[var(--accent)]"
            aria-hidden
          />
        )}
        <Icon size={13} strokeWidth={1.5} />
        {!collapsed && (
          <>
            <span
              className="flex-1 truncate text-left"
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
              }}
            >
              {label}
            </span>
            <ChevronRight
              size={11}
              strokeWidth={1.5}
              className={`shrink-0 transition-transform ${
                open ? "rotate-90" : ""
              }`}
            />
          </>
        )}
      </button>

      {/*
        Current-selection chip — moved BELOW the row per the design.
        Indented (ml-32 ≈ aligns with where the label text starts in the
        row above: 10px left padding + 13px icon + 10px gap = 33px),
        wrapped in a subtle accent-dim hairline box so it reads as
        contextual state rather than another nav item. Hidden in
        collapsed mode (no horizontal room).
      */}
      {!collapsed && (
        <div className="mt-2 mb-2 ml-32 mr-6">
          <div
            className={`px-8 py-3 hairline-subtle truncate ${
              isAllMode ? "bg-[var(--surface-2)]" : "bg-[var(--accent-dim)]"
            }`}
          >
            <span
              className={`block truncate ${
                isAllMode ? "text-text-muted" : "text-[var(--accent)]"
              }`}
              style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                letterSpacing: "1px",
                textTransform: "uppercase",
              }}
            >
              {isAllMode
                ? "All facilities"
                : current?.name ?? "No facility set"}
            </span>
          </div>
        </div>
      )}

      {open && (
        <div
          role="menu"
          className="absolute left-full top-0 ml-2 w-[240px] hairline bg-[var(--surface)] flex flex-col"
          style={{ zIndex: 50 }}
        >
          <p className="px-14 py-8 hairline-b label-text text-text-muted">
            Switch facility
          </p>

          <ul className="py-4 max-h-[280px] overflow-y-auto">
            <li>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={isAllMode}
                onClick={() => handleSelect("all")}
                className={`w-full flex items-center gap-10 px-14 py-8 hover:bg-[var(--surface-2)] transition-colors ${
                  isAllMode ? "text-[var(--accent)]" : "text-text-secondary"
                }`}
              >
                <Layers
                  size={12}
                  strokeWidth={1.5}
                  className="shrink-0"
                  aria-hidden
                />
                <span className="label-text flex-1 text-left">
                  All facilities
                </span>
                {isAllMode && (
                  <Check
                    size={12}
                    strokeWidth={1.5}
                    className="shrink-0 text-[var(--accent)]"
                  />
                )}
              </button>
            </li>

            {facilities.length > 0 && (
              <li aria-hidden>
                <div className="hairline-t mx-14 my-4" />
              </li>
            )}

            {facilities.map((f) => {
              const isCurrent = f.id === currentFacilityId;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isCurrent}
                    onClick={() => handleSelect(f.id)}
                    className={`w-full flex items-center gap-10 px-14 py-8 hover:bg-[var(--surface-2)] transition-colors ${
                      isCurrent ? "text-[var(--accent)]" : "text-text-secondary"
                    }`}
                  >
                    <span
                      className="w-16 h-16 bg-[var(--accent-dim)] flex items-center justify-center shrink-0"
                      aria-hidden
                    >
                      <span
                        className="text-[var(--accent)]"
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 9,
                          fontWeight: 600,
                        }}
                      >
                        {f.name.slice(0, 1).toUpperCase()}
                      </span>
                    </span>
                    <span
                      className="truncate flex-1 text-left"
                      style={{
                        fontFamily: "var(--display)",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      {f.name}
                    </span>
                    {isCurrent && (
                      <Check
                        size={12}
                        strokeWidth={1.5}
                        className="shrink-0 text-[var(--accent)]"
                      />
                    )}
                  </button>
                </li>
              );
            })}

            {facilities.length === 0 && (
              <li aria-hidden className="px-14 py-10 text-text-dim mono-sm">
                No facilities yet
              </li>
            )}
          </ul>

          <div className="hairline-t">
            <Link
              href={manageHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-10 px-14 py-10 text-text-muted hover:text-text hover:bg-[var(--surface-2)] transition-colors"
            >
              <Building2 size={12} strokeWidth={1.5} aria-hidden />
              <span className="label-text">Manage facilities</span>
              <Settings
                size={11}
                strokeWidth={1.5}
                className="ml-auto"
                aria-hidden
              />
            </Link>
          </div>
        </div>
      )}
    </li>
  );
}
