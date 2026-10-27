"use client";

import { useState, useEffect, useRef } from "react";
import { Check, Link2 } from "lucide-react";

/**
 * Copy button for a pending invite's share link — makes the onboarding
 * success screen's promise true: invite links stay recoverable here, so
 * that screen is never a one-shot.
 */
export function CopyInviteLink({ url, email }: { url: string; email: string }) {
  const [copied, setCopied] = useState(false);
  // Timer id kept in a ref so an unmount mid-countdown cannot set
  // state on a gone component.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — nothing sensible to do silently.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="hairline-subtle px-8 py-6 inline-flex items-center gap-6 mono-sm text-text-muted hover:text-text transition-colors shrink-0"
      aria-label={`Copy invite link for ${email}`}
      title="Copy invite link"
    >
      {copied ? (
        <>
          <Check size={11} strokeWidth={1.5} /> Copied
        </>
      ) : (
        <>
          <Link2 size={11} strokeWidth={1.5} /> Copy link
        </>
      )}
    </button>
  );
}
