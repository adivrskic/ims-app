"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "dark" | "light";

const STORAGE_KEY = "Nautilus_theme";

interface Props {
  /** Overrides the default sizing so the toggle can match its container. */
  className?: string;
}

const DEFAULT_CLASS =
  "hairline-subtle hover:border-[var(--border-hover)] text-text-secondary hover:text-text transition-colors flex items-center justify-center shrink-0 h-28 w-28";

export function ThemeToggle({ className = DEFAULT_CLASS }: Props) {
  const [theme, setTheme] = useState<Theme | null>(null);

  // Mount: read whatever the init script set on the html element
  useEffect(() => {
    const current = document.documentElement.getAttribute(
      "data-theme"
    ) as Theme | null;
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    // Keep the mobile address bar in step with the page (see app/layout.tsx).
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", next === "light" ? "#f2f2ef" : "#061124");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage might be blocked; theme still applies for this session
    }
  };

  // Until we know the current theme, render a placeholder of the same size
  // so the sidebar doesn't jump during hydration
  if (!theme) {
    return (
      <span aria-hidden className={className} />
    );
  }

  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      aria-label={`Switch to ${isLight ? "dark" : "light"} theme`}
      title={`Switch to ${isLight ? "dark" : "light"} theme`}
    >
      {isLight ? (
        <Moon size={12} strokeWidth={1.5} />
      ) : (
        <Sun size={12} strokeWidth={1.5} />
      )}
    </button>
  );
}
