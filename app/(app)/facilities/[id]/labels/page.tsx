import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PaperDocument } from "@/components/print/PaperDocument";
import { LABEL_SHEET_CSS } from "@/components/print/labelSheetCss";
import { code128Svg } from "@/lib/print/code128";
import { zplSanitize } from "@/lib/print/zplTemplates";

export const metadata = { title: "Bay labels" };

/**
 * Printable bay-label sheet for one facility — the browser-print fallback
 * for BulkPrintBayLabels (which needs WebUSB + a Zebra, i.e. Chrome/Edge/
 * Opera only). Renders every section's bays × levels as 4in × 2in labels,
 * 2 × 5 per letter sheet, each with a Code 128 barcode of the exact payload
 * the ZPL path prints (zplTemplates.locationLabel): the sanitized,
 * 16-char-capped "{section}-{bay}-{level}" code.
 *
 * ?section=<id> scopes the sheet to a single section.
 *
 * Access control matches the parent facility page: the RLS-scoped fetch by
 * id 404s for anyone outside the org.
 */

/** Hard cap so a pathological layout can't render tens of thousands of SVGs. */
const MAX_LABELS = 1000;

interface BayLabel {
  code: string;
  sectionName: string;
  capacity: string;
}

/** Code 128 covers ASCII 32–126 only — render label text without bars rather than 500ing the sheet on an exotic section code. */
function safeSvg(value: string): string | null {
  try {
    return code128Svg(value);
  } catch {
    return null;
  }
}

export default async function FacilityLabelSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { id } = await params;
  const { section: sectionParam } = await searchParams;
  const supabase = await createClient();

  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (!warehouse) notFound();

  let sectionQuery = supabase
    .from("sections")
    .select("id, code, name, total_bays, total_levels, sort_order")
    .eq("warehouse_id", id)
    .order("sort_order");
  if (sectionParam) sectionQuery = sectionQuery.eq("id", sectionParam);
  const { data: sections } = await sectionQuery;

  // Expand sections into individual bay×level labels — the same loop and
  // the same locationLabel() field treatment as BulkPrintBayLabels, so the
  // paper barcode scans identically to the thermal one.
  const labels: BayLabel[] = [];
  let truncated = false;
  outer: for (const s of sections ?? []) {
    const bays = s.total_bays ?? 1;
    const levels = s.total_levels ?? 1;
    for (let bay = 1; bay <= bays; bay++) {
      for (let level = 1; level <= levels; level++) {
        if (labels.length >= MAX_LABELS) {
          truncated = true;
          break outer;
        }
        labels.push({
          code: zplSanitize(`${s.code ?? ""}-${bay}-${level}`).slice(0, 16),
          sectionName: s.name ? zplSanitize(s.name).slice(0, 30) : "",
          capacity: zplSanitize(`Bay ${bay} · Level ${level}`).slice(0, 30),
        });
      }
    }
  }

  const scopedSection =
    sectionParam && sections && sections.length === 1 ? sections[0] : null;

  return (
    <PaperDocument
      backHref={`/facilities/${warehouse.id}`}
      backLabel="Back to facility"
      toolbarTitle={`Bay labels · ${warehouse.name}${
        scopedSection ? ` · ${scopedSection.name ?? scopedSection.code}` : ""
      }`}
    >
      <style>{LABEL_SHEET_CSS}</style>

      <p className="label-sheet-note">
        <strong>
          {labels.length} label{labels.length === 1 ? "" : "s"}
        </strong>{" "}
        · 4in × 2in, 10 per letter sheet (Avery 5163-compatible). Use the
        Print button above — dotted outlines are cut guides.
        {truncated &&
          ` Capped at ${MAX_LABELS} labels — print one section at a time for the rest.`}
      </p>

      {labels.length === 0 ? (
        <p className="label-sheet-note">
          No sections with bays found for this facility.
        </p>
      ) : (
        <div className="label-grid">
          {labels.map((label, i) => {
            const svg = safeSvg(label.code);
            return (
              // Index key: codes can collide after the ZPL 16-char cap or
              // across same-coded sections; the list is render-once/static.
              <div key={`${label.code}-${i}`} className="label-cell label-bay">
                <div className="label-bay-section">{label.sectionName}</div>
                <div className="label-bay-code">{label.code}</div>
                {svg && (
                  <div
                    className="label-barcode"
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                )}
                <div className="label-barcode-text">{label.code}</div>
                <div className="label-bay-capacity">{label.capacity}</div>
              </div>
            );
          })}
        </div>
      )}
    </PaperDocument>
  );
}
