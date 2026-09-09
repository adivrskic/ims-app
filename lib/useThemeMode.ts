"use client";

import { useEffect, useState } from "react";

export type ThemeMode = "dark" | "light";

/**
 * The active theme, tracking the `data-theme` attribute that the init script
 * (app/layout.tsx) and ThemeToggle write on <html>.
 *
 * For anything styled with CSS, DON'T use this — role tokens already flip on
 * their own. This exists for surfaces that can't read CSS custom properties
 * and need real colour values in JS: WebGL/canvas scenes, chart libraries,
 * and anything painting into a bitmap.
 */
export function useThemeMode(): ThemeMode {
  // Dark is the documented default, and matches what the init script falls
  // back to, so first paint agrees with the server.
  const [mode, setMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    const read = () =>
      setMode(
        document.documentElement.getAttribute("data-theme") === "light"
          ? "light"
          : "dark"
      );
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return mode;
}
