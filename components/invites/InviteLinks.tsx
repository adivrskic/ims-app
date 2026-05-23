"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, ArrowRight, MailCheck } from "lucide-react";

export interface InviteLink {
  email: string;
  url: string;
}

interface Props {
  invites: InviteLink[];
  /** Where the "continue" button goes. Default: overview. */
  continueHref?: string;
}

/**
 * Success panel shown after a workspace is created with pending invites.
 *
 * Emails are sent automatically (platform Resend), but we always surface the
 * raw /invite/{token} links with copy buttons so invites are usable even
 * before DNS finishes verifying, or if a send bounces. Mirrors how staff
 * onboarding surfaces the owner's magic link.
 */
export function InviteLinks({ invites, continueHref = "/" }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 1800);
    } catch {
      // Clipboard blocked — the link is still selectable in the field.
    }
  };

  return (
    <section
      className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16"
      aria-labelledby="invites-sent"
    >
      <header className="flex items-start gap-12">
        <span
          className="w-36 h-36 hairline-subtle bg-[var(--accent-dim)] flex items-center justify-center text-[var(--accent)] shrink-0"
          aria-hidden
        >
          <MailCheck size={16} strokeWidth={1.5} />
        </span>
        <div className="flex-1 min-w-0">
          <p id="invites-sent" className="label-text mb-4">
            Invites sent
          </p>
          <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
            We emailed each teammate a join link. You can also copy a link below
            and share it directly — handy if an email gets filtered.
          </p>
        </div>
      </header>

      <ul className="flex flex-col gap-8">
        {invites.map((inv) => {
          const isCopied = copied === inv.url;
          return (
            <li
              key={inv.email}
              className="hairline-subtle flex items-center gap-12 px-12 py-10"
            >
              <span
                className="text-text truncate"
                style={{
                  fontFamily: "var(--display)",
                  fontSize: 13,
                  minWidth: 0,
                }}
              >
                {inv.email}
              </span>
              <input
                readOnly
                value={inv.url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 bg-transparent outline-none mono-sm text-text-dim"
                aria-label={`Invite link for ${inv.email}`}
              />
              <button
                type="button"
                onClick={() => copy(inv.url)}
                className="hairline-subtle px-10 py-6 inline-flex items-center gap-6 mono-sm text-text-muted hover:text-text transition-colors shrink-0"
                aria-label={`Copy invite link for ${inv.email}`}
              >
                {isCopied ? (
                  <>
                    <Check size={11} strokeWidth={1.5} /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={11} strokeWidth={1.5} /> Copy
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="flex justify-end">
        <Link
          href={continueHref}
          className="hairline-subtle px-14 py-8 inline-flex items-center gap-8 mono-sm text-text hover:border-[var(--border-hover)] transition-colors"
        >
          Go to workspace
          <ArrowRight size={12} strokeWidth={1.5} />
        </Link>
      </footer>
    </section>
  );
}
