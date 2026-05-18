"use client";

import { useEffect, useState } from "react";

interface Props {
  /**
   * Short uppercase label that names what this manifest is for —
   * "Operator manifest" for login, "New operator" for signup, etc.
   * Rendered with a leading em-dash for the editorial mark.
   */
  eyebrow: string;
}

/**
 * Manifest header — sits above the manifest title in each auth form.
 *
 * Renders as:  — OPERATOR MANIFEST            2026.05.17 · 14:23
 *              ─────────────────────────────────────────────────
 *
 * The timestamp updates every 30 seconds. We start with a placeholder
 * ("—") on first paint and fill in the real value on mount, which
 * avoids an SSR/CSR hydration mismatch (server time would not equal
 * client time for the user's locale).
 */
export function ManifestHeader({ eyebrow }: Props) {
  const [stamp, setStamp] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      setStamp(`${y}.${m}.${d} · ${hh}:${mm}`);
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="flex items-baseline justify-between pb-14 mb-24 hairline-b">
      <span className="label-text" style={{ color: "var(--text-muted)" }}>
        — {eyebrow}
      </span>
      <span className="label-text tnum" style={{ color: "var(--text-muted)" }}>
        {stamp ?? "—"}
      </span>
    </header>
  );
}
