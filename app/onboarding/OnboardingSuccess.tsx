"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Copy,
  MailCheck,
  MailWarning,
  PartyPopper,
} from "lucide-react";
import type { OnboardingInvite } from "./actions";

interface Props {
  orgName: string;
  invites: OnboardingInvite[];
  inviteError?: string;
}

/**
 * Post-create success screen. Unlike the old one-shot InviteLinks panel,
 * this reports per-invite email status HONESTLY (a failed send shows "copy
 * this link and send it yourself"), and nothing here is unrecoverable — the
 * same invites live on in Settings → Members.
 */
export function OnboardingSuccess({ orgName, invites, inviteError }: Props) {
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

  const allEmailed = invites.length > 0 && invites.every((i) => i.emailed);

  return (
    <div className="flex flex-col gap-24">
      <div className="flex flex-col gap-12">
        <span className="label-text text-text-muted">— All set</span>
        <h1
          style={{
            fontFamily: "var(--display)",
            fontSize: 34,
            fontWeight: 500,
            lineHeight: 1.05,
            letterSpacing: "-0.5px",
            margin: 0,
            color: "var(--text)",
          }}
        >
          <em className="accent-italic">{orgName}</em> is ready.
        </h1>
      </div>

      {inviteError && (
        <p
          role="alert"
          className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-14 py-12 mono-sm text-[var(--danger)] inline-flex items-start gap-8"
        >
          <MailWarning size={11} strokeWidth={1.5} className="mt-2 shrink-0" />
          <span>{inviteError}</span>
        </p>
      )}

      {invites.length > 0 && (
        <section
          className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16"
          aria-labelledby="invites-created"
        >
          <header className="flex items-start gap-12">
            <span
              className="w-36 h-36 hairline-subtle bg-[var(--accent-dim)] flex items-center justify-center text-[var(--accent)] shrink-0"
              aria-hidden
            >
              {allEmailed ? (
                <MailCheck size={16} strokeWidth={1.5} />
              ) : (
                <PartyPopper size={16} strokeWidth={1.5} />
              )}
            </span>
            <div className="flex-1 min-w-0">
              <p id="invites-created" className="label-text mb-4">
                Invite links created
              </p>
              <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
                Each link works for one teammate and lasts 7 days. These same
                invites stay available in Settings → Members, so nothing is
                lost if you leave this page.
              </p>
            </div>
          </header>

          <ul className="flex flex-col gap-8">
            {invites.map((inv) => {
              const isCopied = copied === inv.url;
              return (
                <li
                  key={inv.email}
                  className="hairline-subtle flex flex-col gap-6 px-12 py-10"
                >
                  <div className="flex items-center gap-12">
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
                    {inv.emailed ? (
                      <span className="mono-sm text-[var(--success)] shrink-0 inline-flex items-center gap-4">
                        <MailCheck size={10} strokeWidth={1.5} /> Email sent
                      </span>
                    ) : (
                      <span className="mono-sm text-[var(--warning)] shrink-0 inline-flex items-center gap-4">
                        <MailWarning size={10} strokeWidth={1.5} /> Email failed
                        — share the link yourself
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-12">
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
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex justify-end">
        <Link
          href="/"
          className="hairline-subtle px-14 py-8 inline-flex items-center gap-8 mono-sm text-text hover:border-[var(--border-hover)] transition-colors"
        >
          Open your dashboard
          <ArrowRight size={12} strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}
