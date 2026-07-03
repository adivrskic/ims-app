"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

/**
 * Shared wrapper for printable paper documents (packing slips, pick lists,
 * PO documents).
 *
 * Rendering model: these pages live under the (app) route group, so they'd
 * normally render inside the dark PageShell (sidebar + masked internal
 * scroller). Instead of fighting that chrome, this component portals a
 * full-viewport, fixed, light-background overlay onto document.body — on
 * screen the user sees ONLY the document (plus a slim toolbar), and in
 * print the CSS hides every other body child so the browser's Print dialog
 * produces a clean black-on-white PDF regardless of the app theme.
 *
 * Before the portal mounts (SSR / first client render) the same markup is
 * rendered inline so there's no blank flash; the effect swaps it to the
 * body portal, which escapes PageShell's mask + overflow clipping.
 *
 * All paper styling is scoped here via the `.paper-*` class names in the
 * single <style> block below — the three document pages only use those
 * classes and never touch the app's dark-theme tokens.
 */

const PAPER_CSS = `
.paper-doc-root {
  position: fixed;
  inset: 0;
  z-index: 300;
  overflow: auto;
  background: #e9e8e3;
  color: #111;
  color-scheme: light;
  -webkit-font-smoothing: antialiased;
  font-family: var(--display, ui-sans-serif), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.paper-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 20px;
  background: #1c1c1a;
  color: #f4f4f0;
}
.paper-toolbar a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #d8d8d2;
  font-size: 12px;
  text-decoration: none;
}
.paper-toolbar a:hover { color: #fff; text-decoration: underline; }
.paper-toolbar-title {
  font-size: 12px;
  color: #8f8f88;
  margin-left: auto;
  margin-right: 12px;
}
.paper-print-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: #f4f4f0;
  color: #111;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.paper-print-btn:hover { background: #fff; }

.paper-sheet {
  box-sizing: border-box;
  width: min(100% - 32px, 820px);
  margin: 28px auto 72px;
  background: #fff;
  color: #111;
  padding: 48px 56px 56px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.12), 0 12px 32px rgba(0,0,0,0.14);
  font-size: 13px;
  line-height: 1.45;
}
.paper-sheet a { color: inherit; text-decoration: none; }

/* ── Document header ── */
.paper-doc-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid #111;
  margin-bottom: 20px;
}
.paper-org-name {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.3px;
  margin: 0;
}
.paper-org-sub {
  font-size: 11px;
  color: #666;
  margin: 2px 0 0;
}
.paper-doc-type {
  text-align: right;
}
.paper-doc-type h2 {
  font-size: 15px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin: 0;
}
.paper-doc-number {
  font-family: var(--mono, ui-monospace), ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  margin: 4px 0 0;
}

/* ── Meta grid (dates, status, parties) ── */
.paper-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px 24px;
  margin: 0 0 20px;
}
.paper-meta-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #777;
  margin: 0 0 2px;
}
.paper-meta-value {
  font-size: 12px;
  color: #111;
  margin: 0;
  white-space: pre-line;
}
.paper-meta-value.mono {
  font-family: var(--mono, ui-monospace), ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}

/* ── Address / party blocks ── */
.paper-parties {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin: 0 0 24px;
}
.paper-party {
  border: 1px solid #ddd;
  padding: 12px 14px;
}

/* ── Tables ── */
.paper-sheet table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 4px;
}
.paper-sheet thead th {
  text-align: left;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: #444;
  padding: 6px 8px;
  border-bottom: 1.5px solid #111;
}
.paper-sheet thead th.num { text-align: right; }
.paper-sheet tbody td {
  padding: 8px;
  border-bottom: 1px solid #ddd;
  vertical-align: top;
  font-size: 12px;
}
.paper-sheet tbody td.num {
  text-align: right;
  font-family: var(--mono, ui-monospace), ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}
.paper-sheet tbody tr { break-inside: avoid; }
.paper-sku {
  font-family: var(--mono, ui-monospace), ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  color: #333;
}
.paper-dim { color: #777; }
.paper-sheet tfoot td {
  padding: 8px;
  font-size: 12px;
  font-weight: 700;
  border-top: 2px solid #111;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ── Zone group headers (pick lists) ── */
.paper-zone-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 22px 0 6px;
  padding: 6px 8px;
  background: #f0efe9;
  border: 1px solid #ddd;
  break-inside: avoid;
}
.paper-zone-header:first-of-type { margin-top: 0; }
.paper-zone-name { font-size: 13px; font-weight: 700; margin: 0; }
.paper-zone-sub { font-size: 11px; color: #666; margin-left: auto; }

/* ── Checkboxes (manual tick-off) ── */
.paper-checkbox {
  display: inline-block;
  width: 13px;
  height: 13px;
  border: 1.5px solid #111;
  vertical-align: middle;
}

/* ── Notes ── */
.paper-notes {
  margin: 20px 0 0;
  border: 1px solid #ddd;
  padding: 12px 14px;
  break-inside: avoid;
}
.paper-notes p {
  margin: 0;
  font-size: 12px;
  white-space: pre-wrap;
}

/* ── Signature block ── */
.paper-signatures {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 40px;
  margin-top: 48px;
  break-inside: avoid;
}
.paper-sign-line {
  border-bottom: 1px solid #111;
  height: 32px;
}
.paper-sign-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #777;
  margin: 5px 0 0;
}

/* ── Footer ── */
.paper-doc-footer {
  margin-top: 32px;
  padding-top: 10px;
  border-top: 1px solid #ddd;
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #888;
}

/* ── Print: only the document, black on white, natural flow ── */
@media print {
  @page { margin: 14mm; }
  html, body {
    height: auto !important;
    overflow: visible !important;
    background: #fff !important;
  }
  /* The root is portaled to <body>, so hiding its siblings removes ALL
     app chrome (sidebar, nav, PageShell, toasts) from the printout. */
  body > *:not(.paper-doc-root) { display: none !important; }
  .paper-doc-root {
    position: static;
    overflow: visible;
    background: #fff;
  }
  .paper-toolbar { display: none !important; }
  .paper-sheet {
    width: auto;
    margin: 0;
    padding: 0;
    box-shadow: none;
  }
}
`;

interface PaperDocumentProps {
  /** Where the toolbar's back link points (e.g. the parent detail page). */
  backHref: string;
  /** Back link copy, e.g. "Back to order". */
  backLabel: string;
  /** Shown dimly in the toolbar, e.g. "Packing slip · ORD-1042". */
  toolbarTitle?: string;
  children: ReactNode;
}

function PrintToolbar({
  backHref,
  backLabel,
  toolbarTitle,
}: Omit<PaperDocumentProps, "children">) {
  return (
    <div className="paper-toolbar">
      <Link href={backHref}>
        <ArrowLeft size={13} strokeWidth={1.5} />
        {backLabel}
      </Link>
      {toolbarTitle && <span className="paper-toolbar-title">{toolbarTitle}</span>}
      <button
        type="button"
        className="paper-print-btn"
        onClick={() => window.print()}
      >
        <Printer size={13} strokeWidth={1.5} />
        Print
      </button>
    </div>
  );
}

export function PaperDocument({
  backHref,
  backLabel,
  toolbarTitle,
  children,
}: PaperDocumentProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  const doc = (
    <div className="paper-doc-root">
      <style>{PAPER_CSS}</style>
      <PrintToolbar
        backHref={backHref}
        backLabel={backLabel}
        toolbarTitle={toolbarTitle}
      />
      <div className="paper-sheet">{children}</div>
    </div>
  );

  // Inline until mounted (no blank flash), then portal to <body> so the
  // document escapes PageShell's mask + overflow clipping entirely.
  return portalTarget ? createPortal(doc, portalTarget) : doc;
}
