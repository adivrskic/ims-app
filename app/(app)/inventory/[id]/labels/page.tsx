import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PaperDocument } from "@/components/print/PaperDocument";
import { LABEL_SHEET_CSS } from "@/components/print/labelSheetCss";
import { code128Svg, zplDataToCode128 } from "@/lib/print/code128";
import { zplSanitize } from "@/lib/print/zplTemplates";
import { gs1128, toGtin14 } from "@/lib/print/gs1";

export const metadata = { title: "Product labels" };

/**
 * Printable product-label sheet for one product — the browser-print fallback
 * for PrintLabelButton (WebUSB + Zebra, Chrome/Edge/Opera only). Renders N
 * copies of the shelf label as 4in × 2in cells, 2 × 5 per letter sheet.
 *
 *   ?count=N     copies (default 12, max 120 — 12 sheets)
 *   ?format=gs1  GS1-128 (01)GTIN with FNC1, mirroring
 *                zplTemplates.gs1ProductLabel; falls back to the standard
 *                Code 128 label when the barcode isn't GTIN-able, exactly
 *                like BulkProductLabelButton does.
 *
 * Barcode payloads are byte-identical to the ZPL path:
 *   standard → zplSanitize(barcode).slice(0, 30)      (productLabel)
 *   gs1      → FNC1 + "01" + GTIN-14                  (gs1ProductLabel)
 *
 * Access control matches the parent product page: RLS-scoped fetch, 404
 * outside the org.
 */

const DEFAULT_COUNT = 12;
const MAX_COUNT = 120;

function parseCount(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_COUNT;
  return Math.min(MAX_COUNT, Math.max(1, Math.floor(n)));
}

export default async function ProductLabelSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ count?: string; format?: string }>;
}) {
  const { id } = await params;
  const { count: rawCount, format: rawFormat } = await searchParams;
  const count = parseCount(rawCount);
  const wantGs1 = rawFormat === "gs1";
  const supabase = await createClient();

  const { data: product } = await supabase
    .from("products")
    .select(
      `id, name, barcode, internal_sku,
       category:categories ( name ),
       locations:locations ( bay, level, section:sections ( code ) )`
    )
    .eq("id", id)
    .maybeSingle();

  if (!product) notFound();

  // Same field treatment as the ZPL templates so the paper label carries
  // identical text + barcode payloads.
  type Named = { name: string | null };
  const categoryRel = product.category as Named | Named[] | null;
  const category = Array.isArray(categoryRel) ? categoryRel[0] : categoryRel;

  type LocRow = {
    bay: number | null;
    level: number | null;
    section: { code: string | null } | { code: string | null }[] | null;
  };
  const locations = (product.locations ?? []) as LocRow[];
  const firstLoc = locations[0];
  const firstLocSection = firstLoc
    ? Array.isArray(firstLoc.section)
      ? firstLoc.section[0]
      : firstLoc.section
    : null;
  // Mirrors the product detail page's PrintLabelButton location string.
  const locationStr = firstLoc
    ? `${firstLocSection?.code ?? "?"}-${firstLoc.bay}-${firstLoc.level}`
    : null;

  const name = zplSanitize(product.name ?? "").slice(0, 40);
  const barcode = zplSanitize(product.barcode ?? "").slice(0, 30);
  const sku = product.internal_sku
    ? zplSanitize(product.internal_sku).slice(0, 20)
    : "";
  const categoryName = category?.name
    ? zplSanitize(category.name).slice(0, 30)
    : "";
  const loc = locationStr ? zplSanitize(locationStr).slice(0, 20) : "";

  // GS1-128 variant — gs1ProductLabel calls toGtin14 on the RAW barcode and
  // returns null for non-GTINs; mirror that, falling back to standard.
  const gtin = wantGs1 ? toGtin14(product.barcode ?? "") : null;
  const gs1 = gtin ? gs1128({ gtin }) : null;
  const isGs1 = Boolean(gs1);

  // Code 128 covers ASCII 32–126 (+FNC1) only — show a note instead of
  // 500ing the sheet if a barcode somehow carries other characters.
  const payload = gs1 ? zplDataToCode128(gs1.zplData) : barcode;
  let barcodeSvg: string | null = null;
  if (payload) {
    try {
      barcodeSvg = code128Svg(payload);
    } catch {
      barcodeSvg = null;
    }
  }

  const formatLabel = isGs1
    ? "GS1-128 (01) GTIN"
    : wantGs1
      ? "Code 128 (barcode isn't GTIN-able, fell back from GS1-128)"
      : "Code 128";

  return (
    <PaperDocument
      backHref={`/inventory/${product.id}`}
      backLabel="Back to product"
      toolbarTitle={`Labels · ${product.name ?? ""}`}
    >
      <style>{LABEL_SHEET_CSS}</style>

      <p className="label-sheet-note">
        <strong>
          {count} label{count === 1 ? "" : "s"}
        </strong>{" "}
        · {formatLabel} · 4in × 2in, 10 per letter sheet (Avery
        5163-compatible). Adjust with ?count=N (max {MAX_COUNT})
        {isGs1 ? "" : " and ?format=gs1"}. Dotted outlines are cut guides.
      </p>

      {!barcodeSvg ? (
        <p className="label-sheet-note">
          {payload
            ? "This barcode contains characters Code 128 cannot encode."
            : "This product has no barcode to print."}
        </p>
      ) : (
        <div className="label-grid">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="label-cell label-product">
              <div className="label-product-row">
                <div className="label-product-main">
                  <div className="label-eyebrow">{categoryName}</div>
                  <div className="label-product-name">{name}</div>
                  <div
                    className="label-barcode"
                    dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                  />
                  {isGs1 ? (
                    <div className="label-gs1-human">{gs1!.human}</div>
                  ) : (
                    <div className="label-barcode-text">{barcode}</div>
                  )}
                </div>
                <div className="label-product-meta">
                  {sku && (
                    <>
                      <span className="label-meta-k">SKU</span>
                      <span className="label-meta-v">{sku}</span>
                    </>
                  )}
                  {!isGs1 && loc && (
                    <>
                      <span className="label-meta-k">LOC</span>
                      <span className="label-meta-v">{loc}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PaperDocument>
  );
}
