"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Search as SearchIcon } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  /** Optional secondary text shown alongside the label (e.g. barcode, code). */
  hint?: string;
  /** Disable a specific option. */
  disabled?: boolean;
}

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Show a search input above the list. Auto-on if options.length > 10. */
  searchable?: boolean;
  /** Optional name — when provided, also renders a hidden input so the
   *  Select can stand alone in a form without a separate hidden input. */
  name?: string;
  /** Optional className for the outer container (mostly for grid sizing). */
  className?: string;
  /** Optional id, otherwise auto-generated for label/aria association. */
  id?: string;
  /** ARIA label for assistive tech when the visible label needs context. */
  ariaLabel?: string;
}

/**
 * Custom dropdown replacement for native <select>.
 *
 * Why this exists:
 *   - Native <select> shows its first option ("— Select —") in the input
 *     area, which collides with the floating field-label visually.
 *   - Native option styling is OS-locked and doesn't match the design.
 *   - We want consistent keyboard + click affordances across the app.
 *
 * Behavior:
 *   - Button is styled exactly like a field-shell with field-label.
 *   - Click toggles a popover anchored below the button.
 *   - Selected option's label appears in the button area.
 *   - When empty: button area is empty (label sits where placeholder would).
 *   - When focused (popover open) or filled: label floats up.
 *   - Searchable when options.length > 10 (or `searchable={true}` forces it).
 *   - Arrow keys move highlight, Enter selects, Esc closes.
 *
 * Form integration:
 *   - Controlled (value + onChange). Parent manages state.
 *   - Optional `name` prop renders a hidden input so the Select can sit
 *     inside a <form> and submit its value without parent plumbing.
 */
export function Select({
  label,
  value,
  onChange,
  options,
  placeholder = "— Select —",
  disabled = false,
  required = false,
  searchable,
  name,
  className,
  id,
  ariaLabel,
}: Props) {
  const generatedId = useId();
  const buttonId = id ?? generatedId;
  const listboxId = `${buttonId}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const isSearchable = searchable ?? options.length > 10;

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (!isSearchable || query.trim() === "") return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint?.toLowerCase().includes(q) ?? false)
    );
  }, [options, query, isSearchable]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  // Focus search input when opening; reset highlight to current selection.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setHighlightedIndex(-1);
      return;
    }
    if (isSearchable && searchRef.current) {
      searchRef.current.focus();
    }
    const idx = options.findIndex((o) => o.value === value);
    setHighlightedIndex(idx);
  }, [open, isSearchable, options, value]);

  const closeAndFocusButton = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  const select = useCallback(
    (v: string) => {
      onChange(v);
      closeAndFocusButton();
    },
    [onChange, closeAndFocusButton]
  );

  // Keyboard handling on the button + within the popover
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === " "
      ) {
        e.preventDefault();
        if (!disabled) setOpen(true);
      }
      return;
    }

    // Open: navigate within filtered list
    if (e.key === "Escape") {
      e.preventDefault();
      closeAndFocusButton();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(filteredOptions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filteredOptions[highlightedIndex];
      if (opt && !opt.disabled) select(opt.value);
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlightedIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlightedIndex(filteredOptions.length - 1);
    }
  };

  // Keep highlighted option in view as user arrows through
  useEffect(() => {
    if (!open || highlightedIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-option-index="${highlightedIndex}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, open]);

  const filled = Boolean(value);

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      {/*
        Hidden input for form submission. Only rendered if name is provided —
        otherwise the parent is expected to manage form value via its own
        hidden inputs.
      */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={value}
          required={required}
          aria-hidden
        />
      )}

      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel ?? label}
        className="field-shell block w-full text-left"
        data-filled={filled || open ? "true" : "false"}
        data-error={undefined}
      >
        <span className="field-label">{label}</span>
        <span
          className={`field-input flex items-center justify-between gap-8 cursor-pointer ${
            disabled ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <span
            className={`flex-1 truncate ${
              selected ? "text-text" : "text-text-dim"
            }`}
          >
            {selected?.label ?? (open ? placeholder : "")}
          </span>
          <ChevronDown
            size={11}
            strokeWidth={1.5}
            className={`shrink-0 text-text-muted transition-transform ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </span>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-2 hairline bg-[var(--surface)] flex flex-col"
          style={{ zIndex: 50 }}
        >
          {isSearchable && (
            <div className="hairline-b px-10 py-8 flex items-center gap-8">
              <SearchIcon
                size={11}
                strokeWidth={1.5}
                className="text-text-dim shrink-0"
                aria-hidden
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search…"
                className="flex-1 bg-transparent border-none outline-none text-text"
                style={{ fontFamily: "var(--mono)", fontSize: 12 }}
                aria-label="Filter options"
              />
            </div>
          )}

          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel ?? label}
            className="py-4 max-h-[260px] overflow-y-auto"
          >
            {filteredOptions.length === 0 ? (
              <li className="px-14 py-10 mono-sm text-text-dim" aria-disabled>
                No results
              </li>
            ) : (
              filteredOptions.map((opt, i) => {
                const isCurrent = opt.value === value;
                const isHighlighted = i === highlightedIndex;
                return (
                  <li key={opt.value} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isCurrent}
                      data-option-index={i}
                      disabled={opt.disabled}
                      onMouseEnter={() => setHighlightedIndex(i)}
                      onClick={() => !opt.disabled && select(opt.value)}
                      className={`w-full flex items-center gap-10 px-14 py-7 text-left transition-colors ${
                        isHighlighted ? "bg-[var(--surface-2)]" : ""
                      } ${
                        isCurrent
                          ? "text-[var(--accent)]"
                          : "text-text-secondary"
                      } ${
                        opt.disabled
                          ? "opacity-40 cursor-not-allowed"
                          : "hover:bg-[var(--surface-2)]"
                      }`}
                    >
                      <span
                        className="flex-1 min-w-0 truncate"
                        style={{
                          fontFamily: "var(--display)",
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        {opt.label}
                      </span>
                      {opt.hint && (
                        <span
                          className="mono-sm text-text-dim shrink-0 truncate max-w-[140px]"
                          style={{ fontSize: 10 }}
                        >
                          {opt.hint}
                        </span>
                      )}
                      {isCurrent && (
                        <Check
                          size={11}
                          strokeWidth={1.5}
                          className="shrink-0 text-[var(--accent)]"
                          aria-hidden
                        />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
