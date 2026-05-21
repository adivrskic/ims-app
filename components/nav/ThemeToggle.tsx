"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "dark" | "light";

const STORAGE_KEY = "Nautilus_theme";

export function ThemeToggle() {
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
      <span
        aria-hidden
        className="hairline-subtle inline-flex items-center justify-center shrink-0 h-28 w-28"
      />
    );
  }

  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      className="hairline-subtle hover:border-[var(--border-hover)] text-text-secondary hover:text-text transition-colors flex items-center justify-center shrink-0 h-28 w-28"
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
