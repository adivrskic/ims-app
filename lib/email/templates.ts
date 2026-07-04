import "server-only";

/**
 * Email template builders.
 *
 * Each template returns `{ subject, html, text }` so we can hand the
 * full payload straight to Resend. HTML is intentionally simple — no
 * tables-in-tables, no remote images, no JS — to maximize deliverability
 * and dark/light-mode behavior across clients.
 *
 * Styling principles:
 *   - Light background (white) — works in every client; dark mode is
 *     handled by mail clients themselves and rarely well by senders
 *   - System font stack — no remote font loads
 *   - Single gold accent on CTAs (matches the app)
 *   - Plain text mirrors the HTML structurally for accessibility +
 *     spam-filter scoring
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.nautilus.io";

interface BaseLayoutProps {
  preheader: string;
  bodyHtml: string;
  bodyText: string;
}

function baseLayout({ preheader, bodyHtml, bodyText }: BaseLayoutProps): {
  html: string;
  text: string;
} {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Nautilus</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1612;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f5f3ef;opacity:0;">${escapeHtml(
    preheader
  )}</div>
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="padding-bottom:24px;border-bottom:1px solid rgba(26,22,18,0.1);">
      <span style="font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:2.5px;font-weight:500;color:#1a1612;text-transform:uppercase;">
        ⚓&nbsp;&nbsp;Nautilus
      </span>
    </div>
    <div style="padding:32px 0;">
      ${bodyHtml}
    </div>
    <div style="padding-top:24px;border-top:1px solid rgba(26,22,18,0.1);font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:10px;color:rgba(26,22,18,0.5);line-height:1.6;">
      Sent by Nautilus · Warehouse management for ops teams<br>
      <a href="${APP_URL}" style="color:rgba(26,22,18,0.5);text-decoration:underline;">${APP_URL.replace(
    /^https?:\/\//,
    ""
  )}</a>
    </div>
  </div>
</body>
</html>`;
  const text = `${bodyText}\n\n---\nNautilus — Warehouse management for ops teams\n${APP_URL}`;
  return { html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ctaButton(href: string, label: string): string {
  return `<table cellspacing="0" cellpadding="0" border="0" style="margin:0;"><tr><td style="background:#D4A853;padding:12px 24px;">
    <a href="${href}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.3px;color:#1a1612;text-decoration:none;display:inline-block;">${escapeHtml(
    label
  )}</a>
  </td></tr></table>`;
}

// ─── Templates ─────────────────────────────────────────────────────

export interface InviteEmailInput {
  inviterName: string;
  inviterEmail: string;
  orgName: string;
  role: string;
  token: string;
  recipientEmail: string;
  expiresAt: Date;
}

export function inviteEmail(input: InviteEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const acceptUrl = `${APP_URL}/invite/${input.token}`;
  const expiresStr = input.expiresAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const subject = `${input.inviterName} invited you to join ${input.orgName} on Nautilus`;
  const preheader = `Accept by ${expiresStr} to join as ${input.role}.`;

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:rgba(26,22,18,0.7);">
      <span style="font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(26,22,18,0.5);">— You've been invited</span>
    </p>
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:500;line-height:1.2;letter-spacing:-0.5px;color:#1a1612;">
      Join <em style="color:#B8923D;font-style:italic;">${escapeHtml(
        input.orgName
      )}</em> on Nautilus
    </h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:rgba(26,22,18,0.7);">
      ${escapeHtml(input.inviterName)} (${escapeHtml(
    input.inviterEmail
  )}) invited you to join their workspace as a <strong>${escapeHtml(
    input.role
  )}</strong>. Click the button below to accept — you'll be signed in or asked to create an account first.
    </p>
    <div style="margin:0 0 24px;">
      ${ctaButton(acceptUrl, "Accept invite →")}
    </div>
    <p style="margin:0 0 8px;font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:rgba(26,22,18,0.5);">
      Or paste this link:
    </p>
    <p style="margin:0 0 24px;font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:11px;word-break:break-all;color:rgba(26,22,18,0.7);">
      ${acceptUrl}
    </p>
    <p style="margin:0;font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:10px;color:rgba(26,22,18,0.4);">
      Expires ${expiresStr} · Sent to ${escapeHtml(input.recipientEmail)}
    </p>
  `;

  const bodyText = `You've been invited

${input.inviterName} (${input.inviterEmail}) invited you to join ${input.orgName} on Nautilus as a ${input.role}.

Accept here:
${acceptUrl}

This invite expires ${expiresStr}.

Sent to ${input.recipientEmail}.`;

  const { html, text } = baseLayout({ preheader, bodyHtml, bodyText });
  return { subject, html, text };
}

export interface TestEmailInput {
  recipientEmail: string;
  fromAddress: string;
  orgName: string;
}

export function testEmail(input: TestEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Resend integration connected · Nautilus";
  const preheader = `Resend is now wired up for ${input.orgName}.`;

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:rgba(26,22,18,0.7);">
      <span style="font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(26,22,18,0.5);">— Test message</span>
    </p>
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:500;line-height:1.2;letter-spacing:-0.5px;color:#1a1612;">
      Resend is <em style="color:#B8923D;font-style:italic;">live</em>.
    </h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:rgba(26,22,18,0.7);">
      Nautilus successfully sent this message through your Resend API key. You'll
      now receive invite emails, optional event digests, and transactional
      notifications at this address.
    </p>
    <table cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 24px;border:1px solid rgba(26,22,18,0.1);background:rgba(26,22,18,0.03);">
      <tr>
        <td style="padding:12px 14px;font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:rgba(26,22,18,0.5);width:120px;">From</td>
        <td style="padding:12px 14px;font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:11px;color:#1a1612;">${escapeHtml(
          input.fromAddress
        )}</td>
      </tr>
      <tr>
        <td style="padding:12px 14px;font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:rgba(26,22,18,0.5);border-top:1px solid rgba(26,22,18,0.08);">Workspace</td>
        <td style="padding:12px 14px;font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:11px;color:#1a1612;border-top:1px solid rgba(26,22,18,0.08);">${escapeHtml(
          input.orgName
        )}</td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;line-height:1.6;color:rgba(26,22,18,0.6);">
      You can configure which events trigger emails — or disconnect entirely — from <a href="${APP_URL}/integrations/resend" style="color:#B8923D;text-decoration:underline;">Integrations → Resend</a>.
    </p>
  `;

  const bodyText = `Resend integration connected

Nautilus successfully sent this message through your Resend API key.

From: ${input.fromAddress}
Workspace: ${input.orgName}

Configure: ${APP_URL}/integrations/resend`;

  const { html, text } = baseLayout({ preheader, bodyHtml, bodyText });
  return { subject, html, text };
}

export interface EventEmailInput {
  eventTitle: string;
  eventBody: string;
  eventLink?: string;
  eventType: string;
  orgName: string;
  recipientEmail: string;
}

export function eventEmail(input: EventEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `[${input.orgName}] ${input.eventTitle}`;
  const preheader = input.eventBody.slice(0, 110);
  const eventTypeLabel = input.eventType
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:rgba(26,22,18,0.7);">
      <span style="font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(26,22,18,0.5);">— ${escapeHtml(
        eventTypeLabel
      )}</span>
    </p>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:500;line-height:1.25;letter-spacing:-0.3px;color:#1a1612;">
      ${escapeHtml(input.eventTitle)}
    </h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:rgba(26,22,18,0.75);white-space:pre-wrap;">${escapeHtml(
      input.eventBody
    )}</p>
    ${
      input.eventLink
        ? `<div style="margin:0 0 24px;">${ctaButton(
            input.eventLink,
            "Open in Nautilus →"
          )}</div>`
        : ""
    }
    <p style="margin:0;font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:10px;color:rgba(26,22,18,0.4);">
      Sent to ${escapeHtml(input.recipientEmail)} · ${escapeHtml(
    input.orgName
  )} · You can disable this in Integrations → Resend
    </p>
  `;

  const bodyText = `${eventTypeLabel}

${input.eventTitle}

${input.eventBody}
${input.eventLink ? `\nOpen: ${input.eventLink}\n` : ""}
Sent to ${input.recipientEmail} · ${input.orgName}`;

  const { html, text } = baseLayout({ preheader, bodyHtml, bodyText });
  return { subject, html, text };
}

// ─── Daily notification digest ─────────────────────────────────────

export interface DigestEmailInput {
  recipientName: string | null;
  /** Unread notifications, newest first (capped by the caller). */
  items: Array<{
    title: string;
    body: string | null;
    link: string | null;
    kind: string;
  }>;
  /** Total unread — may exceed items.length when capped. */
  totalUnread: number;
}

export function digestEmail(input: DigestEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const n = input.totalUnread;
  const subject = `Nautilus digest — ${n} unread notification${n === 1 ? "" : "s"}`;
  const preheader = input.items[0]
    ? `${input.items[0].title}${n > 1 ? ` and ${n - 1} more` : ""}`
    : subject;
  const greeting = input.recipientName
    ? `Morning, ${input.recipientName.split(" ")[0]}.`
    : "Morning.";

  const itemsHtml = input.items
    .map((it) => {
      const href = it.link ? `${APP_URL}${it.link}` : APP_URL;
      return `<div style="padding:12px 0;border-bottom:1px solid rgba(26,22,18,0.08);">
        <a href="${href}" style="font-size:14px;font-weight:600;color:#1a1612;text-decoration:none;">${escapeHtml(
        it.title
      )}</a>
        ${
          it.body
            ? `<p style="margin:4px 0 0;font-size:13px;line-height:1.5;color:rgba(26,22,18,0.7);">${escapeHtml(
                it.body
              )}</p>`
            : ""
        }
      </div>`;
    })
    .join("");

  const overflow =
    n > input.items.length
      ? `<p style="margin:16px 0 0;font-size:12px;color:rgba(26,22,18,0.5);">+ ${
          n - input.items.length
        } more in the app.</p>`
      : "";

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:18px;font-weight:600;letter-spacing:-0.2px;">${escapeHtml(
      greeting
    )}</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:rgba(26,22,18,0.75);">
      You have ${n} unread notification${n === 1 ? "" : "s"} in Nautilus.
    </p>
    ${itemsHtml}
    ${overflow}
    <div style="margin:24px 0 0;">${ctaButton(
      `${APP_URL}/notifications`,
      "Open notifications →"
    )}</div>
    <p style="margin:24px 0 0;font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:10px;color:rgba(26,22,18,0.4);">
      Daily digest · turn off any time on the Notifications page
    </p>
  `;

  const bodyText = `${greeting}

You have ${n} unread notification${n === 1 ? "" : "s"} in Nautilus.

${input.items.map((it) => `- ${it.title}${it.body ? ` — ${it.body}` : ""}`).join("\n")}
${n > input.items.length ? `\n+ ${n - input.items.length} more in the app.` : ""}

Open: ${APP_URL}/notifications
(Daily digest — turn off any time on the Notifications page.)`;

  const { html, text } = baseLayout({ preheader, bodyHtml, bodyText });
  return { subject, html, text };
}
