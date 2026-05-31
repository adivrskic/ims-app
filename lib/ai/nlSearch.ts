"use server";

import { createClient } from "@/lib/supabase/server";
import { nlQuery } from "@/lib/ai/nlQuery";
import type {
  NlQueryIntent,
  NlResult,
  NlSearchResponse,
} from "@/lib/ai/nl-types";

/**
 * Natural-language search (§3). Called from the command palette when its fast
 * command/route matching finds nothing.
 *
 *   query → nl-query edge fn → structured intent → whitelisted RLS query → results
 *
 * The RLS server client scopes every read to the caller's org automatically,
 * so no admin client and no manual org filter. Returns null on any failure
 * (LLM down, unknown intent) so the palette falls back to "no matches".
 *
 * v1 resolves product / scan (movement history) / location intents. Other
 * entities return null until their resolvers are added.
 */
export async function nlSearch(
  query: string
): Promise<NlSearchResponse | null> {
  const q = query.trim();
  if (q.length < 3) return null;

  const intent = await nlQuery(q);
  if (!intent) return null;

  const supabase = await createClient();

  switch (intent.entity) {
    case "product":
      return searchProducts(supabase, intent);
    case "scan":
      return searchScans(supabase, intent);
    case "location":
      return searchLocations(supabase, intent);
    default:
      return null;
  }
}

type Client = Awaited<ReturnType<typeof createClient>>;

// PostgREST or() filters use commas/parens as syntax and `*` as wildcard.
// Strip anything that could break the filter string before interpolating
// model-provided text — the model is untrusted input.
function sanitize(text: string): string {
  return text.replace(/[,()*%:]/g, " ").trim();
}

function clampLimit(n: number | undefined, fallback = 10, max = 25): number {
  if (!n || n < 1) return fallback;
  return Math.min(n, max);
}

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

async function searchProducts(
  supabase: Client,
  intent: NlQueryIntent
): Promise<NlSearchResponse> {
  const f = intent.filters ?? {};
  const limit = clampLimit(intent.limit);

  let qb = supabase
    .from("products")
    .select(
      `id, name, barcode, reorder_point,
       locations:locations ( quantity, section:sections ( code ) )`
    )
    .limit(500);

  if (f.text) {
    const safe = sanitize(f.text);
    if (safe) qb = qb.or(`name.ilike.*${safe}*,barcode.ilike.*${safe}*`);
  }

  const { data } = await qb;

  type Row = {
    id: string;
    name: string;
    barcode: string;
    reorder_point: number | null;
    locations: Array<{
      quantity: number | null;
      section: { code: string | null } | { code: string | null }[] | null;
    }> | null;
  };

  const mapped = ((data ?? []) as Row[]).map((p) => {
    const locs = p.locations ?? [];
    const onHand = locs.reduce((s, l) => s + (l.quantity ?? 0), 0);
    const sections = new Set(
      locs
        .map((l) => firstOf(l.section)?.code?.trim()?.toLowerCase())
        .filter((c): c is string => !!c)
    );
    return { ...p, onHand, sections };
  });

  let rows = mapped;
  if (f.lowStock) {
    rows = rows.filter(
      (p) =>
        p.reorder_point != null &&
        p.reorder_point > 0 &&
        p.onHand <= p.reorder_point
    );
  }
  if (f.sectionCode) {
    const sc = f.sectionCode.toLowerCase();
    rows = rows.filter((p) =>
      [...p.sections].some((s) => s === sc || s.includes(sc))
    );
  }

  rows.sort((a, b) =>
    f.lowStock ? a.onHand - b.onHand : a.name.localeCompare(b.name)
  );

  const results: NlResult[] = rows.slice(0, limit).map((p) => ({
    id: p.id,
    label: p.name,
    sublabel: `${p.barcode} · ${p.onHand.toLocaleString()} on hand`,
    href: `/inventory/${p.id}`,
  }));

  return { interpreted: describe(intent), results };
}

async function searchScans(
  supabase: Client,
  intent: NlQueryIntent
): Promise<NlSearchResponse> {
  const f = intent.filters ?? {};
  const limit = clampLimit(intent.limit, 15);

  let qb = supabase
    .from("scan_history")
    .select(
      `id, action, scanned_at, quantity, product_id,
       product:products ( name, barcode )`
    )
    .order("scanned_at", { ascending: false })
    .limit(limit);

  if (f.action) qb = qb.eq("action", f.action);
  if (f.sinceDays && f.sinceDays > 0) {
    const since = new Date();
    since.setDate(since.getDate() - f.sinceDays);
    qb = qb.gte("scanned_at", since.toISOString());
  }

  const { data } = await qb;

  type Row = {
    id: string;
    action: string;
    scanned_at: string | null;
    quantity: number | null;
    product_id: string | null;
    product:
      | { name: string; barcode: string }
      | { name: string; barcode: string }[]
      | null;
  };

  const results: NlResult[] = ((data ?? []) as Row[]).map((s) => {
    const p = firstOf(s.product);
    const when = s.scanned_at ? new Date(s.scanned_at).toLocaleString() : "—";
    return {
      id: s.id,
      label: `${s.action.replace("_", " ")} · ${p?.name ?? "Unknown product"}`,
      sublabel: `${s.quantity != null ? `qty ${s.quantity} · ` : ""}${when}`,
      href: s.product_id ? `/inventory/${s.product_id}` : "/analytics",
    };
  });

  return { interpreted: describe(intent), results };
}

async function searchLocations(
  supabase: Client,
  intent: NlQueryIntent
): Promise<NlSearchResponse> {
  const f = intent.filters ?? {};
  const limit = clampLimit(intent.limit);

  const { data } = await supabase
    .from("locations")
    .select(
      `id, bay, level, quantity, product_id,
       product:products ( name, barcode ),
       section:sections ( code )`
    )
    .not("product_id", "is", null)
    .limit(500);

  type Row = {
    id: string;
    bay: number | null;
    level: number | null;
    quantity: number | null;
    product_id: string | null;
    product:
      | { name: string; barcode: string }
      | { name: string; barcode: string }[]
      | null;
    section: { code: string | null } | { code: string | null }[] | null;
  };

  let rows = (data ?? []) as Row[];

  if (f.sectionCode) {
    const sc = f.sectionCode.toLowerCase();
    rows = rows.filter((l) => {
      const code = firstOf(l.section)?.code?.trim()?.toLowerCase();
      return code === sc || (code?.includes(sc) ?? false);
    });
  }
  if (f.text) {
    const t = f.text.toLowerCase();
    rows = rows.filter((l) => {
      const p = firstOf(l.product);
      return (
        p?.name?.toLowerCase().includes(t) ||
        p?.barcode?.toLowerCase().includes(t)
      );
    });
  }

  const results: NlResult[] = rows.slice(0, limit).map((l) => {
    const p = firstOf(l.product);
    const code = firstOf(l.section)?.code?.trim() ?? "?";
    return {
      id: l.id,
      label: p?.name ?? "Unknown product",
      sublabel: `${code} · Bay ${l.bay} · L${l.level} · ${(
        l.quantity ?? 0
      ).toLocaleString()} on hand`,
      href: l.product_id ? `/inventory/${l.product_id}` : "/facilities",
    };
  });

  return { interpreted: describe(intent), results };
}

function describe(intent: NlQueryIntent): string {
  const f = intent.filters ?? {};
  const parts: string[] = [];
  if (f.lowStock) parts.push("low-stock");
  parts.push(intent.entity === "scan" ? "movements" : `${intent.entity}s`);
  if (f.sectionCode) parts.push(`in ${f.sectionCode}`);
  if (f.action) parts.push(`action: ${f.action}`);
  if (f.sinceDays) parts.push(`last ${f.sinceDays}d`);
  if (f.text) parts.push(`matching "${f.text}"`);
  return parts.join(" ");
}
