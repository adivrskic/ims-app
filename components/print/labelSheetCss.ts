/**
 * Scoped CSS for the printable label-sheet pages (the browser-print fallback
 * for the WebUSB/ZPL Zebra path). Rendered inside PaperDocument, whose
 * `.paper-*` chrome supplies the light overlay + print isolation; this block
 * only adds the label grid itself.
 *
 * Sheet layout (one deliberate choice, used by BOTH label routes):
 *   2 columns × 5 rows of 4in × 2in labels per US-letter page — the same
 *   4×2 size the ZPL templates print on a Zebra, and compatible with
 *   Avery 5163-style 2"×4" shipping-label stock (10 per sheet).
 *   @page margins: 0.5in top/bottom + 0.25in sides → 8in × 10in live area,
 *   exactly 2 × 5 labels. Faint dotted outlines are cut guides for plain
 *   paper; on adhesive label stock they print near the die-cut edges.
 *
 * These <style> tags render AFTER PaperDocument's own <style> in the DOM,
 * so the `.paper-sheet` overrides below win the cascade at equal specificity.
 */
export const LABEL_SHEET_CSS = `
/* The 2-up grid of 4in labels is wider than the default 820px document
   sheet — widen and slim the screen preview. Print already zeroes this. */
.paper-doc-root .paper-sheet {
  width: min(100% - 32px, 860px);
  padding: 24px;
}

.label-sheet-note {
  margin: 0 0 16px;
  font-size: 11px;
  color: #777;
}
.label-sheet-note strong { color: #444; font-weight: 600; }

.label-grid {
  display: grid;
  grid-template-columns: repeat(2, 4in);
  justify-content: center;
}

.label-cell {
  box-sizing: border-box;
  width: 4in;
  height: 2in;
  padding: 0.14in 0.16in 0.1in;
  outline: 1px dotted #c8c8c0; /* cut guide — outline adds no layout size */
  outline-offset: -1px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  break-inside: avoid;
  page-break-inside: avoid;
}

/* Barcode container: the SVG uses preserveAspectRatio="none" + viewBox, so
   sizing the box scales every module uniformly (ratios preserved). */
.label-barcode { width: 100%; }
.label-barcode svg { display: block; width: 100%; height: 100%; }
.label-barcode-text {
  font-family: var(--mono, ui-monospace), ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 8.5pt;
  letter-spacing: 0.06em;
  text-align: center;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
}

/* ── Bay / location labels — mirrors zplTemplates.locationLabel ── */
.label-bay-section { font-size: 7pt; color: #333; min-height: 10pt; }
.label-bay-code {
  font-size: 28pt;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: 0.02em;
  text-align: center;
  white-space: nowrap;
  margin: 0.02in 0 0.05in;
}
.label-bay .label-barcode {
  box-sizing: border-box;
  height: 0.38in;
  padding: 0 0.25in;
}
.label-bay-capacity { font-size: 6.5pt; color: #444; margin-top: auto; }

/* ── Product labels — mirrors productLabel / gs1ProductLabel ── */
.label-product-row { display: flex; gap: 0.14in; flex: 1; min-height: 0; }
.label-product-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.label-eyebrow { font-size: 6.5pt; color: #333; min-height: 9pt; }
.label-product-name {
  font-size: 11.5pt;
  font-weight: 700;
  line-height: 1.15;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.label-product-main .label-barcode { height: 0.5in; margin-top: auto; }
/* GS1-128 labels print the "(AI) value" line instead of a raw
   interpretation line (ZPL: ^BC …,N + explicit human field). */
.label-gs1-human {
  font-size: 7pt;
  font-family: var(--mono, ui-monospace), ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
}
.label-product-meta {
  flex: none;
  width: 0.95in;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 1px;
  padding-bottom: 0.02in;
}
.label-meta-k {
  font-size: 6pt;
  color: #777;
  letter-spacing: 0.08em;
  margin-top: 3px;
}
.label-meta-v {
  font-size: 8pt;
  font-family: var(--mono, ui-monospace), ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  word-break: break-all;
}

@media print {
  /* Later in the cascade than PaperDocument's 14mm — letter-sheet label
     geometry: 8.5−0.5 = 8in wide (2 × 4in), 11−1 = 10in tall (5 × 2in). */
  @page { margin: 0.5in 0.25in; }
  .label-sheet-note { display: none; }
  .label-cell { outline-color: #ddd; }
}
`;
