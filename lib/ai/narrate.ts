import "server-only";
import { createClient } from "@/lib/supabase/server";

interface NarrationResponse {
  narration: string;
  cached: boolean;
  model: string;
  tokens_used?: number;
  created_at?: string;
}

interface ForecastInput {
  scope: string;
  window: { start: string; end: string };
  metrics: {
    totalScans: number;
    scansToday: number;
    scansLast7: number;
    totalStock: number;
    lowStockCount: number;
    actionMix: Array<{ action: string; count: number; pct: number }>;
    trend14d: number[];
    topSections?: Array<{ code: string; pct: number }>;
  };
}

interface PoDraftInput {
  lines: Array<{
    product_name: string;
    barcode: string;
    velocity: number;
    on_hand: number;
    reorder_point: number;
    lead_time_days: number;
    recommended_qty: number;
  }>;
}

async function invoke(
  body: Record<string, unknown>
): Promise<NarrationResponse | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.functions.invoke<NarrationResponse>(
      "narrate-event",
      { body }
    );
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * 2-3 sentence operations summary for the Analytics page.
 * Returns null on failure so the caller can fall back to a static label.
 */
export async function narrateForecast(
  input: ForecastInput
): Promise<NarrationResponse | null> {
  return invoke({ type: "forecast", ...input });
}

/**
 * One short reasoning sentence per PO line, in the same order as input.
 * Returns null on failure; caller should fall back to a deterministic
 * "velocity X/day, lead Y days" template.
 */
export async function narratePoDraft(
  input: PoDraftInput
): Promise<string[] | null> {
  const result = await invoke({ type: "po_draft", ...input });
  if (!result) return null;
  const lines = result.narration
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length !== input.lines.length) {
    // Length mismatch — model may have merged or split lines.
    // Padding with empties is safer than returning bad mappings.
    while (lines.length < input.lines.length) lines.push("");
  }
  return lines.slice(0, input.lines.length);
}
